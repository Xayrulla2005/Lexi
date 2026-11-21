import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
  UnprocessableEntityException,
} from "@nestjs/common";
import { z } from "zod";
import {
  IdempotencyKey,
  type AgencySubmission,
  type AuditActor,
  type SimCitizen,
  type SubmissionPackage,
  type SubmissionStatus,
  type SubmissionTracking,
} from "@lex/contracts";
import { assertTransition, ApplicationsService } from "../applications/applications.service";
import { DocumentsService } from "../applications/documents.service";
import { AuditService } from "../audit/audit.service";
import { JsonStore } from "../common/json-store";
import { KeyedLock } from "../common/keyed-lock";
import { runtimeFile } from "../common/paths";
import { hashSecret } from "../common/secrets";
import { CasesService } from "../cases/cases.service";
import { EriSimulatorService } from "../sim/eri.service";
import { StepTimer } from "../common/timeout";
import { OneIdSimulatorService } from "../sim/oneid.service";
import { AGENCY_GATEWAY, type AgencyGateway } from "./agency-gateway";

/** Idempotency keys are remembered this long (a client retry window). */
export const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;

const IdempotencyRecord = z.object({
  citizenId: z.string(),
  applicationId: z.string().uuid(),
  submissionId: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
});
type IdempotencyRecord = z.infer<typeof IdempotencyRecord>;

/** Who changes a submission's status: the agency for its own steps, the system for deadlines/escalation. */
const statusActor = (s: AgencySubmission): AuditActor =>
  s.status === "OVERDUE" || s.status === "ESCALATED" ? { type: "system", id: null } : { type: "agency", id: s.agencyId };

/** A submit result plus whether it replayed an earlier one (same Idempotency-Key). */
export interface SubmitResult {
  submission: AgencySubmission;
  replayed: boolean;
}

/**
 * Citizen-side submission flow: builds the package from a signed, consented
 * application and hands it to the AgencyGateway. When a submission becomes
 * OVERDUE, a draft for the first escalation agency is prepared — it is never
 * sent automatically; the user must consent and sign again.
 */
@Injectable()
export class SubmissionsService implements OnModuleInit {
  private readonly logger = new Logger(SubmissionsService.name);
  /** One submit at a time per application (parallel requests wait, then see SUBMITTED). */
  private readonly locks = new KeyedLock();
  /** sha256(citizen + key) -> the submission it produced. */
  private readonly idempotency = new JsonStore<IdempotencyRecord>(runtimeFile("idempotency-keys.json"), IdempotencyRecord);

  constructor(
    @Inject(AGENCY_GATEWAY) private readonly gateway: AgencyGateway,
    @Inject(ApplicationsService) private readonly apps: ApplicationsService,
    @Inject(CasesService) private readonly cases: CasesService,
    @Inject(EriSimulatorService) private readonly eri: EriSimulatorService,
    @Inject(OneIdSimulatorService) private readonly oneId: OneIdSimulatorService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
  ) {}

  onModuleInit(): void {
    this.gateway.onStatusChange((s) => {
      const from: SubmissionStatus | null = s.history.at(-2)?.status ?? null;
      this.audit.record({
        type: "SUBMISSION_STATUS_CHANGED",
        actor: statusActor(s),
        applicationId: s.applicationId,
        submissionId: s.id,
        caseId: s.caseId,
        data: { from, to: s.status, adapterType: s.adapterType },
      });
      void this.audit.persist("audit.status").catch((e: unknown) => this.logger.error(`audit persist failed: ${(e as Error).message}`));
      if (s.status !== "OVERDUE") return;
      this.prepareEscalation(s).catch((e: unknown) =>
        this.logger.error(`escalation draft for ${s.receiptId} failed: ${(e as Error).message}`),
      );
    });
  }

  /**
   * Submits a signed, consented application exactly once.
   * - Parallel requests for one application are serialized (in-process lock); the later ones
   *   find it SUBMITTED and get 409 — or, with the same Idempotency-Key, the same submission.
   * - Idempotency-Key (optional, per citizen, 24 h): same key + same application -> the original
   *   submission (replayed: true); same key + another application -> 422.
   * - The connector call carries a stable key (the application id), so a retry after a crash
   *   between the connector call and saving the result does not create a second submission.
   */
  submit(applicationId: string, ownerId: string, citizen: SimCitizen, idempotencyKey?: string): Promise<SubmitResult> {
    const keyHash = this.keyHash(ownerId, idempotencyKey);
    return this.locks.run(`application:${applicationId}`, () => this.submitLocked(applicationId, ownerId, citizen, keyHash));
  }

  private keyHash(citizenId: string, key: string | undefined): string | null {
    if (key === undefined) return null;
    const parsed = IdempotencyKey.safeParse(key);
    if (!parsed.success) throw new BadRequestException(`Invalid Idempotency-Key: ${parsed.error.issues[0]?.message ?? "format"}`);
    return hashSecret(`${citizenId}:${parsed.data}`);
  }

  private async submitLocked(applicationId: string, ownerId: string, citizen: SimCitizen, keyHash: string | null): Promise<SubmitResult> {
    const timer = new StepTimer(`submit ${applicationId.slice(0, 8)}`, this.logger);
    let outcome = "ok";
    try {
      const app = await timer.step("load", () => this.apps.owned(applicationId, ownerId));
      // The identity that submits must be the one the application was prepared and signed with.
      if (app.identityId && app.identityId !== citizen.id) throw new ForbiddenException("Another OneID identity signed this application");

      const known = keyHash ? this.idempotency.get(keyHash) : undefined;
      if (known && Date.parse(known.createdAt) + IDEMPOTENCY_TTL_MS > Date.now()) {
        if (known.applicationId !== applicationId) throw new UnprocessableEntityException("Idempotency-Key was used for another application");
        const original = await this.gateway.getStatus(known.submissionId);
        if (original) {
          outcome = "replayed";
          this.audit.record({
            type: "SUBMISSION_REPLAYED",
            actor: { type: "citizen", id: ownerId },
            applicationId,
            submissionId: original.id,
            caseId: app.caseId,
            data: { receiptId: original.receiptId },
          });
          await this.audit.persist("submit.replay");
          return { submission: original, replayed: true };
        }
      }

      assertTransition(app, "submit"); // SIGNED only: 409 if already submitted, 400 if not signed
      if (!app.consentAt) throw new BadRequestException("Consent is required before submission");
      const signature = app.signature;
      if (!signature) throw new BadRequestException("The application must be signed (ERI simulator) first");
      const consentAt = app.consentAt;

      const c = this.cases.get(app.caseId);
      const d = c.routingDecision;
      const expectedAgency = app.kind === "PRIMARY" ? d?.agencyId : d?.escalation[0]?.id;
      if (!d || !expectedAgency || app.agency.id !== expectedAgency) {
        throw new BadRequestException("Agency is not part of this case's routing decision");
      }

      const pdf = await timer.step("pdf", () => this.apps.pdf(app.id));
      const check = await timer.step("verify", () => this.eri.verify(pdf, signature));
      if (!check.valid) throw new BadRequestException(check.message);

      const documents = await timer.step("documents", () => this.documents.forPackage(app.id));
      const fields: Record<string, string> = {};
      for (const f of app.fields) if (f.value !== null) fields[f.key] = f.value;
      const pkg: SubmissionPackage = {
        applicationId: app.id,
        caseId: c.id,
        agencyId: app.agency.id,
        agencyName: app.agency.name,
        pdfBase64: pdf.toString("base64"),
        signature,
        caseInfo: { caseId: c.id, problemId: d.problemId, title: d.title, facts: c.analysis?.facts ?? [], fields },
        consentAt,
        citizen,
        documents,
      };

      const submission = await timer.step("gateway", () => this.gateway.submit(pkg, { idempotencyKey: `application:${app.id}` }));
      await timer.step("save", () => {
        this.apps.markSubmitted(app.id, submission.id);
        this.cases.setStatus(c.id, "SUBMITTED");
        if (keyHash) {
          this.idempotency.set(keyHash, { citizenId: ownerId, applicationId: app.id, submissionId: submission.id, createdAt: new Date().toISOString() });
        }
        const actor: AuditActor = { type: "citizen", id: ownerId };
        const ids = { applicationId: app.id, submissionId: submission.id, caseId: c.id };
        this.audit.record({
          type: "SUBMISSION_CREATED",
          actor,
          ...ids,
          data: { agencyId: submission.agencyId, kind: app.kind, adapterType: submission.adapterType, idempotencyKey: keyHash !== null },
        });
        this.audit.record({
          type: "RECEIPT_ISSUED",
          actor: { type: "agency", id: submission.agencyId },
          ...ids,
          // A MOCK receipt (SIM-…) is a simulator receipt, not an official one.
          data: { receiptId: submission.receiptId, adapterType: submission.adapterType, simulated: submission.adapterType === "MOCK" },
        });
      });
      await timer.step("persist", () =>
        Promise.all([
          this.apps.persist("submit.persist"),
          this.cases.persist("submit.persist"),
          this.idempotency.persist("submit.idempotency"),
          this.audit.persist("submit.audit"),
        ]),
      );
      const parent = app.kind === "ESCALATION" ? app.parentSubmissionId : null;
      if (parent) await timer.step("escalate", () => this.gateway.markEscalated(parent));
      return { submission, replayed: false };
    } catch (e) {
      outcome = (e as Error).message;
      throw e;
    } finally {
      timer.done(outcome);
    }
  }

  /** Status for the citizen who owns the submission, plus the escalation draft id if one was prepared. */
  async tracking(submissionId: string, citizenId: string): Promise<SubmissionTracking> {
    const s = await this.gateway.getStatus(submissionId);
    if (!s) throw new NotFoundException("Submission not found");
    this.apps.owned(s.applicationId, citizenId);
    return { ...s, escalationApplicationId: this.apps.escalationDraftFor(s.id)?.id ?? null };
  }

  /** OVERDUE primary submission -> draft for the first escalation agency (never auto-submitted). */
  private async prepareEscalation(s: AgencySubmission): Promise<void> {
    const app = this.apps.get(s.applicationId);
    // TODO: escalation of an escalation (next agency in eskalatsiya) is not modelled yet.
    if (app.kind !== "PRIMARY") return;
    const target = this.cases.get(s.caseId).routingDecision?.escalation[0];
    if (!target) return;
    const draft = await this.apps.createEscalationDraft(app, target, s, this.oneId.citizen(app.identityId ?? app.citizenId));
    await this.apps.persist("escalation.draft");
    this.logger.log(`OVERDUE ${s.receiptId}: escalation draft ${draft.id} for ${target.id} (not submitted)`);
  }
}

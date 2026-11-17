import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import type { AgencySubmission, SimCitizen, SubmissionPackage, SubmissionTracking } from "@lex/contracts";
import { ApplicationsService } from "../applications/applications.service";
import { CasesService } from "../cases/cases.service";
import { EriSimulatorService } from "../sim/eri.service";
import { StepTimer } from "../common/timeout";
import { OneIdSimulatorService } from "../sim/oneid.service";
import { AGENCY_GATEWAY, type AgencyGateway } from "./agency-gateway";

/**
 * Citizen-side submission flow: builds the package from a signed, consented
 * application and hands it to the AgencyGateway. When a submission becomes
 * OVERDUE, a draft for the first escalation agency is prepared — it is never
 * sent automatically; the user must consent and sign again.
 */
@Injectable()
export class SubmissionsService implements OnModuleInit {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    @Inject(AGENCY_GATEWAY) private readonly gateway: AgencyGateway,
    @Inject(ApplicationsService) private readonly apps: ApplicationsService,
    @Inject(CasesService) private readonly cases: CasesService,
    @Inject(EriSimulatorService) private readonly eri: EriSimulatorService,
    @Inject(OneIdSimulatorService) private readonly oneId: OneIdSimulatorService,
  ) {}

  onModuleInit(): void {
    this.gateway.onStatusChange((s) => {
      if (s.status !== "OVERDUE") return;
      this.prepareEscalation(s).catch((e: unknown) =>
        this.logger.error(`escalation draft for ${s.receiptId} failed: ${(e as Error).message}`),
      );
    });
  }

  async submit(applicationId: string, citizen: SimCitizen): Promise<AgencySubmission> {
    const timer = new StepTimer(`submit ${applicationId.slice(0, 8)}`, this.logger);
    let outcome = "ok";
    try {
      const app = await timer.step("load", () => this.apps.owned(applicationId, citizen.id));
      if (app.submissionId) throw new ConflictException("Application has already been submitted");
      if (!app.consentAt) throw new BadRequestException("Consent is required before submission");
      if (!app.signature) throw new BadRequestException("The application must be signed (ERI simulator) first");
      const signature = app.signature;
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
      };

      const submission = await timer.step("gateway", () => this.gateway.submit(pkg));
      await timer.step("save", () => {
        this.apps.markSubmitted(app.id, submission.id);
        this.cases.setStatus(c.id, "SUBMITTED");
      });
      await timer.step("persist", () => Promise.all([this.apps.persist("submit.persist"), this.cases.persist("submit.persist")]));
      const parent = app.kind === "ESCALATION" ? app.parentSubmissionId : null;
      if (parent) await timer.step("escalate", () => this.gateway.markEscalated(parent));
      return submission;
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
    const draft = await this.apps.createEscalationDraft(app, target, s, this.oneId.citizen(app.citizenId));
    await this.apps.persist("escalation.draft");
    this.logger.log(`OVERDUE ${s.receiptId}: escalation draft ${draft.id} for ${target.id} (not submitted)`);
  }
}

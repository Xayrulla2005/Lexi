import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  Application,
  type AgencyContact,
  type ApplicationField,
  type ApplicationState,
  type EriSignature,
  type SimCitizen,
} from "@lex/contracts";
import { defaultChatProvider, fieldContexts, isDontKnow, runIntake, type ProviderChoice } from "@lex/ai";
import { LLM_CHAT } from "../llm/llm.module";
import { AuditService } from "../audit/audit.service";
import { CasesService } from "../cases/cases.service";
import { JsonStore } from "../common/json-store";
import { runtimeFile } from "../common/paths";
import { StepTimer, withTimeout } from "../common/timeout";
import { renderApplicationPdf } from "./pdf";
import { escalationTemplate, fieldKeys, fillTemplate, loadTemplate } from "./template";

/** Fields filled from the simulated OneID profile. */
const ONEID_FIELDS: Readonly<Record<string, (c: SimCitizen) => string>> = {
  fio: (c) => c.fio,
  manzil: (c) => c.manzil,
  telefon: (c) => c.telefon,
};
/** Fields filled by the server. */
/** dd.mm.yyyy in Tashkent time. */
const formatDate = (d: Date): string => new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent" }).format(d);

/**
 * updatedAt doubles as the optimistic-lock version: every save gets a strictly later time
 * (two saves in the same millisecond would otherwise share a version).
 */
function nextVersion(previous: string | undefined): string {
  const now = Date.now();
  const prev = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(now, prev + 1)).toISOString();
}

const SYSTEM_FIELDS: Readonly<Record<string, () => string>> = {
  ariza_sanasi: () => formatDate(new Date()),
};

/** The overdue submission an escalation draft follows up on. */
export interface OverdueSubmission {
  id: string;
  receiptId: string;
  submittedAt: string;
  agencyName: string;
}

/** Application plus the exact PDF bytes that were signed (frozen at signing). */
const StoredApplication = Application.extend({ signedPdfBase64: z.string().nullable() });
type StoredApplication = z.infer<typeof StoredApplication>;

const blankForPdf = (key: string): string => `________ (${key})`;

/** The lifecycle state, derived from the data (see ApplicationState in @lex/contracts). */
export function stateOf(app: Pick<Application, "consentAt" | "signature" | "submissionId">): ApplicationState {
  if (app.submissionId) return "SUBMITTED";
  if (app.signature) return "SIGNED";
  if (app.consentAt) return "CONSENTED";
  return "DRAFT";
}

export type ApplicationAction = "edit" | "consent" | "sign" | "submit";

/** Allowed transitions: action -> states it may start from. */
const ALLOWED: Readonly<Record<ApplicationAction, readonly ApplicationState[]>> = {
  edit: ["DRAFT", "CONSENTED"], // editing a consented application resets the consent (back to DRAFT)
  consent: ["DRAFT", "CONSENTED"],
  sign: ["CONSENTED"],
  submit: ["SIGNED"],
};

/**
 * Rejects an action that the lifecycle does not allow from the current state:
 * a missing step (sign without consent, submit unsigned) is 400; acting on a finalized
 * application (edit/consent/sign after signing, anything after submission) is 409.
 */
export function assertTransition(app: Pick<Application, "consentAt" | "signature" | "submissionId">, action: ApplicationAction): void {
  const state = stateOf(app);
  if (ALLOWED[action].includes(state)) return;
  if (state === "SUBMITTED") throw new ConflictException("Application has already been submitted");
  if (state === "SIGNED") throw new ConflictException("Application is already signed");
  if (action === "sign") throw new BadRequestException("Consent is required before signing");
  throw new BadRequestException("The application must be signed (ERI simulator) first");
}

interface CreateParams {
  caseId: string;
  kind: Application["kind"];
  parentSubmissionId: string | null;
  templateId: string;
  agency: AgencyContact;
  citizen: SimCitizen;
  /** Turns the loaded template into the application text (escalation header + fact line). */
  adapt?: (template: string) => string;
}

/**
 * Applications built from catalog templates. The template text is never changed;
 * only {{placeholders}} are filled. Consent is reset whenever a field changes,
 * and nothing can change after the application is signed.
 */
@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);
  private readonly store = new JsonStore<StoredApplication>(runtimeFile("applications.json"), StoredApplication);
  /** Set by DocumentsService: digest of the attached documents, recorded with the signature. */
  private documentsDigest: ((applicationId: string) => { count: number; sha256: string }) | null = null;

  constructor(
    @Inject(CasesService) private readonly cases: CasesService,
    @Optional() @Inject(LLM_CHAT) private readonly chatChoice: ProviderChoice | null = null,
    /** Optional so unit tests can build the service without the audit log. */
    @Optional() @Inject(AuditService) private readonly audit: AuditService | null = null,
  ) {}

  /** Returns the open primary draft for this case and citizen, or creates one. */
  async createForCase(caseId: string, citizen: SimCitizen): Promise<Application> {
    // Only the case owner may turn it into an application (403 otherwise).
    const d = this.cases.owned(caseId, citizen.id).routingDecision;
    if (!d || d.routeType !== "RULE_BASED" || !d.templateId || !d.agencyId) {
      throw new BadRequestException("This case has no catalog route with an application template");
    }
    const existing = this.store
      .values()
      .find((a) => a.caseId === caseId && a.citizenId === citizen.id && a.kind === "PRIMARY" && !a.submissionId);
    if (existing) return this.view(existing);

    const agency = d.agencies.find((a) => a.id === d.agencyId);
    if (!agency) throw new BadRequestException(`Agency ${d.agencyId} missing from the routing decision`);
    return this.create({ caseId, kind: "PRIMARY", parentSubmissionId: null, templateId: d.templateId, agency, citizen });
  }

  /** Draft of the same application for another agency (escalation). Never submitted automatically. */
  async createEscalationDraft(
    source: Application,
    agency: AgencyContact,
    parent: OverdueSubmission,
    citizen: SimCitizen,
  ): Promise<Application> {
    const existing = this.store.values().find((a) => a.parentSubmissionId === parent.id);
    if (existing) return this.view(existing);
    const previous = {
      receiptId: parent.receiptId,
      submittedOn: formatDate(new Date(parent.submittedAt)),
      agencyName: parent.agencyName,
    };
    const draft = await this.create({
      caseId: source.caseId,
      kind: "ESCALATION",
      parentSubmissionId: parent.id,
      templateId: source.templateId,
      agency,
      citizen,
      adapt: (template) => escalationTemplate(template, agency.name, previous),
    });
    // Reuse the user's manual answers; consent and signature must be given again.
    const manual: Record<string, string> = {};
    for (const f of source.fields) if (f.source === "MANUAL" && f.value) manual[f.key] = f.value;
    return Object.keys(manual).length ? this.updateFields(draft.id, citizen.id, manual) : draft;
  }

  /** The escalation draft prepared for an overdue submission, if any. */
  escalationDraftFor(submissionId: string): Application | undefined {
    const draft = this.store.values().find((a) => a.parentSubmissionId === submissionId);
    return draft && this.view(draft);
  }

  get(id: string): Application {
    return this.view(this.stored(id));
  }

  /** Applications of a citizen, newest first. */
  listForCitizen(citizenId: string): Application[] {
    return this.store
      .values()
      .filter((a) => a.citizenId === citizenId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => this.view(a));
  }

  updateFields(id: string, citizenId: string, values: Readonly<Record<string, string>>): Application {
    const app = this.owned(id, citizenId);
    assertTransition(app, "edit");
    for (const key of Object.keys(values)) {
      const field = app.fields.find((f) => f.key === key);
      if (!field) throw new BadRequestException(`Template ${app.templateId} has no field ${key}`);
      if (field.source !== "MANUAL") throw new BadRequestException(`Field ${key} is filled automatically`);
    }
    const fields = app.fields.map((f): ApplicationField => {
      const v = values[f.key];
      if (v === undefined) return f;
      const value = v.trim() || null;
      // Typed in the form or answered to Lexi: the user's own answer.
      return { ...f, value, provenance: value === null ? null : value === f.value ? f.provenance : "javob" };
    });
    this.consentReset(app, citizenId);
    return this.save({ ...app, fields, consentAt: null });
  }

  /**
   * Lexi's intake: values stated in the story fill the empty MANUAL fields (provenance "hikoya");
   * for the rest at most 3 questions are prepared. Runs once per application.
   */
  async runIntake(id: string, citizenId: string): Promise<Application> {
    const app = this.owned(id, citizenId);
    assertTransition(app, "edit");
    if (app.intake) return app;
    const decision = this.cases.get(app.caseId).routingDecision;
    const missing = app.fields.filter((f) => f.source === "MANUAL" && !f.value).map((f) => f.key);
    const chat = this.chatChoice ?? defaultChatProvider();
    const result = await runIntake(
      chat.provider,
      this.cases.story(app.caseId),
      fieldContexts(app.template, missing),
      decision?.title ?? app.agency.name,
    );
    // The LLM call took time: the application may have changed meanwhile (optimistic check).
    this.assertUnchanged(id, app.updatedAt);
    const found = new Map(result.extracted.map((e) => [e.key, e.value]));
    const fields = app.fields.map((f): ApplicationField => {
      const v = found.get(f.key);
      return v !== undefined && f.source === "MANUAL" && !f.value ? { ...f, value: v, provenance: "hikoya" } : f;
    });
    return this.save({
      ...this.stored(id),
      fields,
      consentAt: null,
      intake: {
        understood: result.understood,
        questions: result.questions.map((q) => ({ ...q, status: "open" as const })),
        model: chat.provider?.id ?? "keyword",
        degraded: result.degraded,
      },
    });
  }

  /** Answer to one of Lexi's questions. "Bilmayman" leaves the field empty (shown in yellow). */
  answer(id: string, citizenId: string, key: string, answer: string): Application {
    const app = this.owned(id, citizenId);
    assertTransition(app, "edit");
    const q = app.intake?.questions.find((x) => x.key === key);
    if (!app.intake || !q) throw new BadRequestException(`No question for field ${key}`);
    const skip = isDontKnow(answer);
    const updated = skip ? app : this.updateFields(id, citizenId, { [key]: answer });
    const questions = app.intake.questions.map((x) => (x.key === key ? { ...x, status: skip ? ("skipped" as const) : ("answered" as const) } : x));
    return this.save({ ...this.stored(id), fields: updated.fields, consentAt: null, intake: { ...app.intake, questions } });
  }

  consent(id: string, citizenId: string): Application {
    const app = this.owned(id, citizenId);
    assertTransition(app, "consent");
    const missing = this.missing(app.fields);
    if (missing.length) throw new BadRequestException(`Fill in the fields first: ${missing.join(", ")}`);
    const saved = this.save({ ...app, consentAt: new Date().toISOString() });
    this.audit?.record({
      type: "APPLICATION_CONSENTED",
      actor: { type: "citizen", id: citizenId },
      applicationId: id,
      caseId: app.caseId,
      data: { kind: app.kind, agencyId: app.agency.id },
    });
    return saved;
  }

  /** Filled application text; empty fields are rendered as blanks. */
  text(app: Application): string {
    const values = new Map<string, string>();
    for (const f of app.fields) if (f.value !== null) values.set(f.key, f.value);
    return fillTemplate(app.template, values, blankForPdf);
  }

  /** The signed PDF when signed, otherwise a fresh preview. */
  async pdf(id: string): Promise<Buffer> {
    const app = this.stored(id);
    if (app.signedPdfBase64) return Buffer.from(app.signedPdfBase64, "base64");
    return withTimeout(renderApplicationPdf(this.text(app)), "pdf.render");
  }

  /** Waits until all application changes are on disk (bounded by the operation timeout). */
  persist(operation = "applications.persist"): Promise<void> {
    return this.store.persist(operation);
  }

  /**
   * Renders the final PDF and signs it with the (simulated) ERI.
   * Requires every field and a stored consent; the exact signed bytes are frozen.
   */
  async sign(
    id: string,
    citizenId: string,
    eri: { sign(citizenId: string, pdf: Buffer): Promise<EriSignature> },
  ): Promise<Application> {
    const timer = new StepTimer(`sign ${id.slice(0, 8)}`, this.logger);
    let outcome = "ok";
    try {
      const app = await timer.step("load", () => this.owned(id, citizenId));
      assertTransition(app, "sign");
      if (app.missingFields.length) throw new BadRequestException(`Fill in the fields first: ${app.missingFields.join(", ")}`);
      const pdf = await timer.step("pdf", () => renderApplicationPdf(this.text(app)));
      const signature = await timer.step("eri", () => eri.sign(citizenId, pdf));
      // Optimistic lock: the signed bytes must be what the application holds now. If it was
      // edited (consent reset) or signed by a parallel request meanwhile, this signature is dropped.
      const signed = await timer.step("save", () => this.attachSignature(id, pdf, signature, app.updatedAt));
      this.audit?.record({
        type: "APPLICATION_SIGNED",
        actor: { type: "citizen", id: citizenId },
        applicationId: id,
        caseId: app.caseId,
        data: {
          algorithm: signature.algorithm,
          pdfSha256: signature.digest,
          simulated: signature.simulated,
          // The documents attached at signing time (frozen afterwards: no edits after SIGNED).
          documents: this.documentsDigest?.(id).count ?? 0,
          documentsSha256: this.documentsDigest?.(id).sha256 ?? null,
        },
      });
      await timer.step("persist", () => Promise.all([this.persist("sign.persist"), this.audit?.persist("sign.audit")]));
      return signed;
    } catch (e) {
      outcome = (e as Error).message;
      throw e;
    } finally {
      timer.done(outcome);
    }
  }

  /**
   * Called by the e-signature step: freezes the PDF bytes together with the signature.
   * `expectedVersion` (updatedAt read before signing) makes it an optimistic lock: 409 if the
   * application changed in between.
   */
  attachSignature(id: string, pdf: Buffer, signature: EriSignature, expectedVersion?: string): Application {
    if (expectedVersion !== undefined) this.assertUnchanged(id, expectedVersion);
    const app = this.stored(id);
    assertTransition(app, "sign");
    return this.save({ ...app, signature, signedPdfBase64: pdf.toString("base64") });
  }

  useDocumentsDigest(fn: (applicationId: string) => { count: number; sha256: string }): void {
    this.documentsDigest = fn;
  }

  /**
   * A document was added or removed: the same rules as editing a field — only before signing,
   * and a given consent is withdrawn (the user must confirm the new package). Bumps the version,
   * so a signature computed in parallel is rejected.
   */
  documentsChanged(id: string, citizenId: string): Application {
    const app = this.owned(id, citizenId);
    assertTransition(app, "edit");
    if (app.consentAt) {
      this.audit?.record({
        type: "APPLICATION_CONSENT_RESET",
        actor: { type: "citizen", id: citizenId },
        applicationId: id,
        caseId: app.caseId,
        data: { reason: "documents_changed" },
      });
    }
    return this.save({ ...this.stored(id), consentAt: null });
  }

  /** Fails unless the application may still be edited (DRAFT/CONSENTED). */
  assertEditable(id: string, citizenId: string): Application {
    const app = this.owned(id, citizenId);
    assertTransition(app, "edit");
    return app;
  }

  /** SIGNED -> SUBMITTED (only from SIGNED). */
  markSubmitted(id: string, submissionId: string): Application {
    const app = this.stored(id);
    assertTransition(app, "submit");
    return this.save({ ...app, submissionId });
  }

  /** Throws unless the application belongs to this (test) citizen. */
  owned(id: string, citizenId: string): Application {
    const app = this.stored(id);
    if (app.citizenId !== citizenId) throw new ForbiddenException("Application belongs to another (test) citizen");
    return this.view(app);
  }

  private async create(p: CreateParams): Promise<Application> {
    const loaded = await loadTemplate(p.templateId);
    const template = p.adapt ? p.adapt(loaded) : loaded;
    const fields = fieldKeys(template).map((key): ApplicationField => {
      const oneId = ONEID_FIELDS[key];
      if (oneId) return { key, value: oneId(p.citizen), source: "ONEID", provenance: null };
      const system = SYSTEM_FIELDS[key];
      if (system) return { key, value: system(), source: "SYSTEM", provenance: null };
      return { key, value: null, source: "MANUAL", provenance: null };
    });
    const now = new Date().toISOString();
    return this.save({
      id: randomUUID(),
      state: "DRAFT",
      caseId: p.caseId,
      kind: p.kind,
      parentSubmissionId: p.parentSubmissionId,
      citizenId: p.citizen.id,
      templateId: p.templateId,
      agency: p.agency,
      template,
      fields,
      missingFields: [],
      consentAt: null,
      signature: null,
      submissionId: null,
      intake: null,
      createdAt: now,
      updatedAt: now,
      signedPdfBase64: null,
    });
  }

  private assertUnchanged(id: string, version: string): void {
    if (this.stored(id).updatedAt !== version) throw new ConflictException("Application changed meanwhile; please retry");
  }

  /** Editing after consent withdraws it: logged so the consent history is complete. */
  private consentReset(app: Application, citizenId: string): void {
    if (!app.consentAt) return;
    this.audit?.record({
      type: "APPLICATION_CONSENT_RESET",
      actor: { type: "citizen", id: citizenId },
      applicationId: app.id,
      caseId: app.caseId,
      data: { reason: "fields_changed" },
    });
  }

  private missing(fields: readonly ApplicationField[]): string[] {
    return fields.filter((f) => !f.value).map((f) => f.key);
  }

  private stored(id: string): StoredApplication {
    const app = this.store.get(id);
    if (!app) throw new NotFoundException("Application not found");
    return app;
  }

  private save(app: StoredApplication | (Application & { signedPdfBase64?: string | null })): Application {
    const prev = this.store.get(app.id);
    const next: StoredApplication = {
      ...app,
      signedPdfBase64: app.signedPdfBase64 ?? prev?.signedPdfBase64 ?? null,
      missingFields: this.missing(app.fields),
      state: stateOf(app),
      updatedAt: nextVersion(prev?.updatedAt),
    };
    this.store.set(next.id, next);
    return this.view(next);
  }

  private view(app: StoredApplication): Application {
    return Application.parse({ ...app, state: stateOf(app) });
  }
}

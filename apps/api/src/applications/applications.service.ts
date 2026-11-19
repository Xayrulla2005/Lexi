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
  type EriSignature,
  type SimCitizen,
} from "@lex/contracts";
import { defaultChatProvider, fieldContexts, isDontKnow, runIntake, type ProviderChoice } from "@lex/ai";
import { LLM_CHAT } from "../llm/llm.module";
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

  constructor(
    @Inject(CasesService) private readonly cases: CasesService,
    @Optional() @Inject(LLM_CHAT) private readonly chatChoice: ProviderChoice | null = null,
  ) {}

  /** Returns the open primary draft for this case and citizen, or creates one. */
  async createForCase(caseId: string, citizen: SimCitizen): Promise<Application> {
    const d = this.cases.get(caseId).routingDecision;
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
    this.assertEditable(app);
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
    return this.save({ ...app, fields, consentAt: null });
  }

  /**
   * Lexi's intake: values stated in the story fill the empty MANUAL fields (provenance "hikoya");
   * for the rest at most 3 questions are prepared. Runs once per application.
   */
  async runIntake(id: string, citizenId: string): Promise<Application> {
    const app = this.owned(id, citizenId);
    this.assertEditable(app);
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
    this.assertEditable(app);
    const q = app.intake?.questions.find((x) => x.key === key);
    if (!app.intake || !q) throw new BadRequestException(`No question for field ${key}`);
    const skip = isDontKnow(answer);
    const updated = skip ? app : this.updateFields(id, citizenId, { [key]: answer });
    const questions = app.intake.questions.map((x) => (x.key === key ? { ...x, status: skip ? ("skipped" as const) : ("answered" as const) } : x));
    return this.save({ ...this.stored(id), fields: updated.fields, consentAt: null, intake: { ...app.intake, questions } });
  }

  consent(id: string, citizenId: string): Application {
    const app = this.owned(id, citizenId);
    this.assertEditable(app);
    const missing = this.missing(app.fields);
    if (missing.length) throw new BadRequestException(`Fill in the fields first: ${missing.join(", ")}`);
    return this.save({ ...app, consentAt: new Date().toISOString() });
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
      this.assertEditable(app);
      if (app.missingFields.length) throw new BadRequestException(`Fill in the fields first: ${app.missingFields.join(", ")}`);
      if (!app.consentAt) throw new BadRequestException("Consent is required before signing");
      const pdf = await timer.step("pdf", () => renderApplicationPdf(this.text(app)));
      const signature = await timer.step("eri", () => eri.sign(citizenId, pdf));
      const signed = await timer.step("save", () => this.attachSignature(id, pdf, signature));
      await timer.step("persist", () => this.persist("sign.persist"));
      return signed;
    } catch (e) {
      outcome = (e as Error).message;
      throw e;
    } finally {
      timer.done(outcome);
    }
  }

  /** Called by the e-signature step: freezes the PDF bytes together with the signature. */
  attachSignature(id: string, pdf: Buffer, signature: EriSignature): Application {
    return this.save({ ...this.stored(id), signature, signedPdfBase64: pdf.toString("base64") });
  }

  markSubmitted(id: string, submissionId: string): Application {
    return this.save({ ...this.stored(id), submissionId });
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

  private assertEditable(app: Application): void {
    if (app.signature || app.submissionId) throw new ConflictException("Application is already signed");
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
      updatedAt: new Date().toISOString(),
    };
    this.store.set(next.id, next);
    return this.view(next);
  }

  private view(app: StoredApplication): Application {
    return Application.parse(app);
  }
}

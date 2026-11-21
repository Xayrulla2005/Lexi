import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AgencySubmission, SubmissionPackage, type SimClock, type SubmissionStatus } from "@lex/contracts";
import { JsonStore } from "../common/json-store";
import { runtimeFile } from "../common/paths";
import { LegalRoutingService } from "../legal-routing/legal-routing.service";
import type { AgencyGateway, StatusListener, SubmitOptions } from "./agency-gateway";
import { ADVANCE_DAYS, loadSimConfig, type SimConfig } from "./sim-config";

const RECEIPT_PREFIX: Record<string, string> = {
  mehnat_inspeksiyasi: "MI",
  profilaktika_inspektori: "PI",
  virtual_qabulxona: "VQ",
  mib: "MIB",
  iiv: "IIV",
  bandlik_vazirligi: "BV",
  prokuratura: "PR",
};

/** Statuses from which the agency side may still act / the deadline still runs. */
const OPEN: ReadonlySet<SubmissionStatus> = new Set(["SUBMITTED", "RECEIVED", "IN_REVIEW"]);
const ALLOWED_FROM: Readonly<Record<"RECEIVED" | "IN_REVIEW", ReadonlySet<SubmissionStatus>>> = {
  RECEIVED: new Set(["SUBMITTED"]),
  IN_REVIEW: new Set(["SUBMITTED", "RECEIVED"]),
};

/** Persisted part of a submission; the clock fields (dueAt, simulatedDays, responseDays) are computed. */
const SubmissionCore = AgencySubmission.omit({ dueAt: true, simulatedDays: true, responseDays: true });
type SubmissionCore = z.infer<typeof SubmissionCore>;

const StoredSubmission = z.object({
  submission: SubmissionCore,
  pkg: SubmissionPackage,
  /** Simulated days added with the cabinet button. */
  shiftDays: z.number().nonnegative().default(0),
  /** Deadline fixed at submission: catalog `javob_muddati` of the agency, else SIM_RESPONSE_DAYS. */
  responseDays: z.number().positive().nullable().default(null),
  /** SubmitOptions.idempotencyKey of the call that created it (null for older records). */
  idempotencyKey: z.string().nullable().default(null),
});
type StoredSubmission = z.infer<typeof StoredSubmission>;

/**
 * SIMULATOR — stands in for real agencies. Nothing leaves this process.
 * The agency side is driven by the cabinet (/idora): accept, review, respond, and
 * "⏩ Vaqtni oldinga surish (+15 kun)".
 *
 * Clock: MANUAL by default (no DEMO_SPEED) — simulated days move only with the button.
 * AUTO when DEMO_SPEED is set — days also run in real time and a timer marks OVERDUE.
 * An open submission becomes OVERDUE once simulated days reach SIM_RESPONSE_DAYS.
 * State is persisted to data/runtime/submissions.json.
 */
@Injectable()
export class MockAgencyAdapter implements AgencyGateway, OnModuleInit, OnModuleDestroy {
  readonly adapterType = "MOCK" as const;
  private readonly logger = new Logger(MockAgencyAdapter.name);
  private readonly store = new JsonStore<StoredSubmission>(runtimeFile("submissions.json"), StoredSubmission);
  private readonly listeners: StatusListener[] = [];
  private readonly config: SimConfig = loadSimConfig();
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(LegalRoutingService) private readonly routing: LegalRoutingService) {}

  /** Agency deadline from the catalog (`javob_muddati`), else the simulator default. */
  responseDaysFor(agencyId: string): number {
    return this.routing.agencies().find((a) => a.id === agencyId)?.responseDays ?? this.config.responseDays;
  }

  onModuleInit(): void {
    const { msPerDay } = this.config;
    if (msPerDay === null) return; // MANUAL clock: no timer, nothing becomes OVERDUE by itself.
    // Check deadlines ~10 times per simulated day (bounded), so OVERDUE appears promptly in demos.
    this.timer = setInterval(() => this.checkDeadlines(), Math.min(60_000, Math.max(50, msPerDay / 10)));
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onStatusChange(listener: StatusListener): void {
    this.listeners.push(listener);
  }

  clock(): SimClock {
    return {
      adapterType: this.adapterType,
      mode: this.config.msPerDay === null ? "MANUAL" : "AUTO",
      msPerDay: this.config.msPerDay,
      responseDays: this.config.responseDays,
      advanceDays: ADVANCE_DAYS,
    };
  }

  async submit(pkg: SubmissionPackage, options: SubmitOptions): Promise<AgencySubmission> {
    // Idempotent: the same key never creates a second submission (and no second receipt).
    const existing = this.store.values().find((s) => s.idempotencyKey === options.idempotencyKey);
    if (existing) return this.view(existing);
    const at = new Date().toISOString();
    const counter = this.store.values().length + 451;
    const submission: SubmissionCore = {
      id: randomUUID(),
      caseId: pkg.caseId,
      applicationId: pkg.applicationId,
      agencyId: pkg.agencyId,
      agencyName: pkg.agencyName,
      adapterType: this.adapterType,
      status: "SUBMITTED",
      receiptId: `SIM-${RECEIPT_PREFIX[pkg.agencyId] ?? "XX"}-${String(counter).padStart(5, "0")}`,
      submittedAt: at,
      history: [{ status: "SUBMITTED", at }],
      response: null,
    };
    const stored: StoredSubmission = {
      submission,
      pkg,
      shiftDays: 0,
      responseDays: this.responseDaysFor(pkg.agencyId),
      idempotencyKey: options.idempotencyKey,
    };
    this.store.set(submission.id, stored);
    await this.store.persist("gateway.submit");
    return this.view(stored);
  }

  async getStatus(id: string): Promise<AgencySubmission | undefined> {
    this.checkDeadlines();
    const s = this.store.get(id);
    return s && this.view(s);
  }

  async listInbox(agencyId: string): Promise<AgencySubmission[]> {
    this.checkDeadlines();
    return this.store
      .values()
      .filter((s) => s.submission.agencyId === agencyId)
      .map((s) => this.view(s))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async respond(id: string, text: string): Promise<AgencySubmission> {
    const s = this.stored(id);
    // A late answer (OVERDUE) is still accepted; an escalated or answered one is closed.
    if (!OPEN.has(s.submission.status) && s.submission.status !== "OVERDUE") {
      throw new ConflictException(`Submission is ${s.submission.status}`);
    }
    const out = this.transition(s, "ANSWERED", { response: { text, respondedAt: new Date().toISOString() } });
    await this.store.persist("gateway.respond");
    return out;
  }

  async markEscalated(id: string): Promise<AgencySubmission> {
    const s = this.stored(id);
    if (s.submission.status !== "OVERDUE") throw new ConflictException(`Only OVERDUE submissions can be escalated`);
    const out = this.transition(s, "ESCALATED");
    await this.store.persist("gateway.escalate");
    return out;
  }

  /** SIMULATOR cabinet: "Qabul qilish" (RECEIVED) and "Ko'rib chiqilmoqda" (IN_REVIEW). */
  async setAgencyStatus(id: string, status: "RECEIVED" | "IN_REVIEW"): Promise<AgencySubmission> {
    this.checkDeadlines();
    const s = this.stored(id);
    if (!ALLOWED_FROM[status].has(s.submission.status)) {
      throw new BadRequestException(`Cannot go from ${s.submission.status} to ${status}`);
    }
    const out = this.transition(s, status);
    await this.store.persist("gateway.status");
    return out;
  }

  /** SIMULATOR cabinet: "⏩ Vaqtni oldinga surish (+15 kun)" for one open submission. */
  async advance(id: string, days: number = ADVANCE_DAYS): Promise<AgencySubmission> {
    const s = this.stored(id);
    if (!OPEN.has(s.submission.status)) throw new ConflictException(`Submission is ${s.submission.status}`);
    this.store.set(id, { ...s, shiftDays: s.shiftDays + days });
    this.checkDeadlines();
    await this.store.persist("gateway.advance");
    return this.view(this.stored(id));
  }

  /** SIMULATOR cabinet: the full package (incl. PDF bytes). */
  getPackage(id: string): SubmissionPackage {
    return this.stored(id).pkg;
  }

  /** Marks open submissions whose simulated days reached the deadline as OVERDUE. Idempotent. */
  checkDeadlines(now: number = Date.now()): void {
    for (const s of this.store.values()) {
      if (OPEN.has(s.submission.status) && this.elapsedDays(s, now) >= this.deadlineDays(s)) {
        this.transition(s, "OVERDUE");
      }
    }
  }

  private elapsedDays(s: StoredSubmission, now: number = Date.now()): number {
    const { msPerDay } = this.config;
    const realDays = msPerDay === null ? 0 : Math.max(0, now - Date.parse(s.submission.submittedAt)) / msPerDay;
    return realDays + s.shiftDays;
  }

  /** Stored per submission; older records without it use the current default. */
  private deadlineDays(s: StoredSubmission): number {
    return s.responseDays ?? this.config.responseDays;
  }

  private view(s: StoredSubmission): AgencySubmission {
    const { msPerDay } = this.config;
    const responseDays = this.deadlineDays(s);
    const dueAt =
      msPerDay === null
        ? null
        : new Date(Date.parse(s.submission.submittedAt) + (responseDays - s.shiftDays) * msPerDay).toISOString();
    return {
      ...s.submission,
      history: [...s.submission.history],
      dueAt,
      simulatedDays: Math.floor(this.elapsedDays(s) * 10) / 10,
      responseDays,
    };
  }

  private transition(s: StoredSubmission, status: SubmissionStatus, patch: Partial<SubmissionCore> = {}): AgencySubmission {
    const submission: SubmissionCore = {
      ...s.submission,
      ...patch,
      status,
      history: [...s.submission.history, { status, at: new Date().toISOString() }],
    };
    const next = { ...s, submission };
    this.store.set(submission.id, next);
    const view = this.view(next);
    for (const l of this.listeners) {
      try {
        l({ ...view });
      } catch (e) {
        this.logger.error(`status listener failed: ${(e as Error).message}`);
      }
    }
    return view;
  }

  private stored(id: string): StoredSubmission {
    const s = this.store.get(id);
    if (!s) throw new NotFoundException("Submission not found");
    return s;
  }
}

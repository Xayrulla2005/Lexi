import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AgencySubmission, SubmissionPackage, type SubmissionStatus } from "@lex/contracts";
import { JsonStore } from "../common/json-store";
import { runtimeFile } from "../common/paths";
import type { AgencyGateway, StatusListener } from "./agency-gateway";
import { loadSimConfig, type SimConfig } from "./sim-config";

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

const StoredSubmission = z.object({ submission: AgencySubmission, pkg: SubmissionPackage });
type StoredSubmission = z.infer<typeof StoredSubmission>;

/**
 * SIMULATOR — stands in for real agencies. Nothing leaves this process.
 * The agency side is driven by the cabinet (/idora): accept, review, respond.
 * Deadlines are checked on a timer: an open submission past dueAt becomes OVERDUE.
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

  onModuleInit(): void {
    // Check deadlines ~10 times per simulated day (bounded), so OVERDUE appears promptly in demos.
    const every = Math.min(60_000, Math.max(50, this.config.msPerDay / 10));
    this.timer = setInterval(() => this.checkDeadlines(), every);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onStatusChange(listener: StatusListener): void {
    this.listeners.push(listener);
  }

  async submit(pkg: SubmissionPackage): Promise<AgencySubmission> {
    const now = Date.now();
    const at = new Date(now).toISOString();
    const counter = this.store.values().length + 451;
    const submission: AgencySubmission = {
      id: randomUUID(),
      caseId: pkg.caseId,
      applicationId: pkg.applicationId,
      agencyId: pkg.agencyId,
      agencyName: pkg.agencyName,
      adapterType: this.adapterType,
      status: "SUBMITTED",
      receiptId: `SIM-${RECEIPT_PREFIX[pkg.agencyId] ?? "XX"}-${String(counter).padStart(5, "0")}`,
      submittedAt: at,
      dueAt: new Date(now + this.config.responseDays * this.config.msPerDay).toISOString(),
      history: [{ status: "SUBMITTED", at }],
      response: null,
    };
    this.store.set(submission.id, { submission, pkg });
    return { ...submission };
  }

  async getStatus(id: string): Promise<AgencySubmission | undefined> {
    this.checkDeadlines();
    const s = this.store.get(id);
    return s && { ...s.submission };
  }

  async listInbox(agencyId: string): Promise<AgencySubmission[]> {
    this.checkDeadlines();
    return this.store
      .values()
      .filter((s) => s.submission.agencyId === agencyId)
      .map((s) => ({ ...s.submission }))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async respond(id: string, text: string): Promise<AgencySubmission> {
    const s = this.stored(id);
    // A late answer (OVERDUE) is still accepted; an escalated or answered one is closed.
    if (!OPEN.has(s.submission.status) && s.submission.status !== "OVERDUE") {
      throw new ConflictException(`Submission is ${s.submission.status}`);
    }
    const at = new Date().toISOString();
    return this.transition(s, "ANSWERED", { response: { text, respondedAt: at } });
  }

  async markEscalated(id: string): Promise<AgencySubmission> {
    const s = this.stored(id);
    if (s.submission.status !== "OVERDUE") throw new ConflictException(`Only OVERDUE submissions can be escalated`);
    return this.transition(s, "ESCALATED");
  }

  /** SIMULATOR cabinet: "Qabul qilish" (RECEIVED) and "Ko'rib chiqilmoqda" (IN_REVIEW). */
  async setAgencyStatus(id: string, status: "RECEIVED" | "IN_REVIEW"): Promise<AgencySubmission> {
    this.checkDeadlines();
    const s = this.stored(id);
    if (!ALLOWED_FROM[status].has(s.submission.status)) {
      throw new BadRequestException(`Cannot go from ${s.submission.status} to ${status}`);
    }
    return this.transition(s, status);
  }

  /** SIMULATOR cabinet: the full package (incl. PDF bytes). */
  getPackage(id: string): SubmissionPackage {
    return this.stored(id).pkg;
  }

  /** Marks open submissions past their deadline as OVERDUE. Idempotent. */
  checkDeadlines(now: number = Date.now()): void {
    for (const s of this.store.values()) {
      const due = s.submission.dueAt ? Date.parse(s.submission.dueAt) : Number.POSITIVE_INFINITY;
      if (OPEN.has(s.submission.status) && now > due) this.transition(s, "OVERDUE");
    }
  }

  private transition(s: StoredSubmission, status: SubmissionStatus, patch: Partial<AgencySubmission> = {}): AgencySubmission {
    const submission: AgencySubmission = {
      ...s.submission,
      ...patch,
      status,
      history: [...s.submission.history, { status, at: new Date().toISOString() }],
    };
    this.store.set(submission.id, { ...s, submission });
    for (const l of this.listeners) {
      try {
        l({ ...submission });
      } catch (e) {
        this.logger.error(`status listener failed: ${(e as Error).message}`);
      }
    }
    return { ...submission };
  }

  private stored(id: string): StoredSubmission {
    const s = this.store.get(id);
    if (!s) throw new NotFoundException("Submission not found");
    return s;
  }
}

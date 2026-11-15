import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AgencySubmission, SubmissionStatus } from "@lex/contracts";
import type { AgencyGateway, SubmissionCommand } from "./agency-gateway";

const RECEIPT_PREFIX: Record<string, string> = {
  mehnat_inspeksiyasi: "MI",
  profilaktika_inspektori: "PI",
  virtual_qabulxona: "VQ",
  mib: "MIB",
  iiv_102: "IIV",
};

/** Simulated response window, in simulated days. Not a legal deadline. */
const SIMULATED_DUE_DAYS = 15;

/**
 * SIMULATOR — stands in for a real agency. Nothing leaves this process.
 * Status advances on timers; DEMO_SPEED = milliseconds per simulated day.
 * TODO(Xayrulla): durable jobs (e.g. BullMQ) and notifications to bot/web.
 */
@Injectable()
export class MockAgencyAdapter implements AgencyGateway, OnModuleDestroy {
  readonly adapterType = "MOCK" as const;
  private readonly submissions = new Map<string, AgencySubmission>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private counter = 450;
  private readonly day = Number(process.env.DEMO_SPEED ?? 86_400_000);

  async submit(command: SubmissionCommand): Promise<AgencySubmission> {
    const now = Date.now();
    const submission: AgencySubmission = {
      id: randomUUID(),
      caseId: command.caseId,
      agencyId: command.agencyId,
      adapterType: this.adapterType,
      status: "RECEIVED",
      receiptId: `SIM-${RECEIPT_PREFIX[command.agencyId] ?? "XX"}-${String(++this.counter).padStart(5, "0")}`,
      submittedAt: new Date(now).toISOString(),
      dueAt: new Date(now + SIMULATED_DUE_DAYS * this.day).toISOString(),
    };
    this.submissions.set(submission.id, submission);

    this.schedule(submission.id, "IN_REVIEW", 2);
    this.schedule(submission.id, "ANSWERED", 10);
    return { ...submission };
  }

  async getStatus(id: string): Promise<AgencySubmission | undefined> {
    const s = this.submissions.get(id);
    return s && { ...s };
  }

  async listByAgency(agencyId: string): Promise<AgencySubmission[]> {
    return [...this.submissions.values()].filter((s) => s.agencyId === agencyId).map((s) => ({ ...s }));
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private schedule(id: string, status: SubmissionStatus, afterDays: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const s = this.submissions.get(id);
      if (s) s.status = status;
    }, afterDays * this.day);
    timer.unref();
    this.timers.add(timer);
  }
}

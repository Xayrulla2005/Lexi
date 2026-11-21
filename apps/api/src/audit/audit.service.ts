import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { AuditEvent, type AuditActor, type AuditEventType } from "@lex/contracts";
import { JsonStore } from "../common/json-store";
import { runtimeFile } from "../common/paths";

const GENESIS = "0".repeat(64);

export interface AuditInput {
  type: AuditEventType;
  actor: AuditActor;
  applicationId?: string | null;
  submissionId?: string | null;
  caseId?: string | null;
  /** Scalars only: ids, statuses, digests, flags. Never field values, document text, PDFs or secrets. */
  data?: Record<string, string | number | boolean | null>;
}

/** The hashed part of an event, in a fixed key order. */
const canonical = (e: Omit<AuditEvent, "hash">): string =>
  JSON.stringify([e.id, e.seq, e.at, e.type, e.actor.type, e.actor.id, e.applicationId, e.submissionId, e.caseId, e.data, e.prevHash]);

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** The next event of the chain after `last` (shared by the JSON store and the PostgreSQL repository). */
export function buildAuditEvent(last: Pick<AuditEvent, "seq" | "hash"> | null, input: AuditInput, now = new Date()): AuditEvent {
  const base: Omit<AuditEvent, "hash"> = {
    id: randomUUID(),
    seq: (last?.seq ?? 0) + 1,
    at: now.toISOString(),
    type: input.type,
    actor: input.actor,
    applicationId: input.applicationId ?? null,
    submissionId: input.submissionId ?? null,
    caseId: input.caseId ?? null,
    data: input.data ?? {},
    prevHash: last?.hash ?? GENESIS,
  };
  return AuditEvent.parse({ ...base, hash: sha256(canonical(base)) });
}

/**
 * Append-only audit log (data/runtime/audit-events.json). There is no update or delete:
 * events are only added. Each event's hash covers the previous event's hash, so a changed,
 * removed or reordered event breaks verify(). Writes are synchronous in memory (ordered),
 * persisted with the same atomic file writes as the other stores.
 */
@Injectable()
export class AuditService {
  private readonly store = new JsonStore<AuditEvent>(runtimeFile("audit-events.json"), AuditEvent);
  private last: AuditEvent | null;

  constructor() {
    this.last = this.ordered().at(-1) ?? null;
  }

  record(input: AuditInput): AuditEvent {
    const event = buildAuditEvent(this.last, input);
    this.store.set(event.id, event);
    this.last = event;
    return event;
  }

  /** Events of one application and of the submissions made from it, in order. */
  forApplication(applicationId: string, submissionIds: readonly string[] = []): AuditEvent[] {
    const subs = new Set(submissionIds);
    return this.ordered().filter((e) => e.applicationId === applicationId || (e.submissionId !== null && subs.has(e.submissionId)));
  }

  /** Events matching a filter, in order (for reports and tests; read-only copies). */
  find(match: (e: AuditEvent) => boolean): AuditEvent[] {
    return this.ordered().filter(match);
  }

  /** Recomputes the chain. `brokenAt` is the first seq whose hash or link does not match. */
  verify(): { valid: boolean; brokenAt: number | null; count: number } {
    let prev = GENESIS;
    const events = this.ordered();
    for (const [i, e] of events.entries()) {
      const { hash, ...rest } = e;
      if (e.seq !== i + 1 || e.prevHash !== prev || sha256(canonical(rest)) !== hash) return { valid: false, brokenAt: e.seq, count: events.length };
      prev = hash;
    }
    return { valid: true, brokenAt: null, count: events.length };
  }

  persist(operation = "audit.persist"): Promise<void> {
    return this.store.persist(operation);
  }

  private ordered(): AuditEvent[] {
    return this.store.values().sort((a, b) => a.seq - b.seq);
  }
}

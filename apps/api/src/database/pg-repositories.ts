import type { AuditEvent, ConsultationStatus } from "@lex/contracts";
import type { DataSource } from "typeorm";
import { buildAuditEvent, type AuditInput } from "../audit/audit.service";

/**
 * PostgreSQL repositories for the concurrency-critical paths (multi-instance safe):
 * every statement is parameterized ($1, $2, …) — no value is ever concatenated into SQL.
 *
 * STATUS: implemented against the migration schema and unit-tested with a recording executor;
 * NOT yet wired into the services (they still use the JSON stores) and NOT verified against a
 * live PostgreSQL (no test database was available). See the implementation report.
 */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** Runs `work` in one transaction (BEGIN … COMMIT, ROLLBACK on error). */
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

/** SqlExecutor over a TypeORM DataSource (raw parameterized queries, real transactions). */
export function typeormExecutor(ds: Pick<DataSource, "query" | "transaction">): SqlExecutor {
  const query =
    (run: (sql: string, params?: unknown[]) => Promise<unknown>) =>
    async <T>(sql: string, params?: readonly unknown[]): Promise<T[]> =>
      (await run(sql, params ? [...params] : undefined)) as T[];
  return {
    query: query((sql, params) => ds.query(sql, params)),
    transaction: (work) =>
      ds.transaction((manager) => {
        // Inside a transaction every query — including a nested transaction() — uses the SAME
        // manager (same connection, same locks). Opening a new DataSource transaction here would
        // run outside the row/advisory locks taken by the outer transaction.
        const tx: SqlExecutor = {
          query: query((sql, params) => manager.query(sql, params)),
          transaction: (inner) => inner(tx),
        };
        return work(tx);
      }),
  };
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Fixed advisory-lock key that serializes audit appends across all API instances. */
export const AUDIT_LOCK_KEY = 7_311_002;

/** Append-only audit log: one writer at a time (transaction-scoped advisory lock) keeps the hash chain linear. */
export class PgAuditRepository {
  constructor(private readonly db: SqlExecutor) {}

  append(input: AuditInput): Promise<AuditEvent> {
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [AUDIT_LOCK_KEY]);
      const [last] = await tx.query<{ seq: string; hash: string }>("SELECT seq, hash FROM audit_events ORDER BY seq DESC LIMIT 1");
      const event = buildAuditEvent(last ? { seq: Number(last.seq), hash: last.hash } : null, input);
      await tx.query(
        `INSERT INTO audit_events (seq, id, at, type, actor_type, actor_id, application_id, submission_id, case_id, data, prev_hash, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [event.seq, event.id, event.at, event.type, event.actor.type, event.actor.id, event.applicationId, event.submissionId, event.caseId, JSON.stringify(event.data), event.prevHash, event.hash],
      );
      return event;
    });
  }
}

/** Idempotency keys: the first request with a key wins atomically (unique primary key). */
export class PgIdempotencyRepository {
  constructor(private readonly db: SqlExecutor) {}

  /** Returns null if this call reserved the key, else the existing record. */
  async reserve(keyHash: string, citizenId: string, applicationId: string, tx: SqlExecutor = this.db): Promise<{ applicationId: string; submissionId: string | null } | null> {
    const inserted = await tx.query(
      `INSERT INTO idempotency_keys (key_hash, citizen_id, application_id, created_at)
       VALUES ($1, $2, $3, now()) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash`,
      [keyHash, citizenId, applicationId],
    );
    if (inserted.length) return null;
    const [row] = await tx.query<{ application_id: string; submission_id: string | null }>(
      "SELECT application_id, submission_id FROM idempotency_keys WHERE key_hash = $1",
      [keyHash],
    );
    return row ? { applicationId: row.application_id, submissionId: row.submission_id } : null;
  }

  complete(keyHash: string, submissionId: string, tx: SqlExecutor = this.db): Promise<unknown> {
    return tx.query("UPDATE idempotency_keys SET submission_id = $2 WHERE key_hash = $1 AND submission_id IS NULL", [keyHash, submissionId]);
  }
}

export interface LockedApplication {
  id: string;
  citizenId: string;
  state: string;
  submissionId: string | null;
  version: number;
}

/** Applications: row lock for submission, optimistic version checks for consent/sign. */
export class PgApplicationRepository {
  constructor(private readonly db: SqlExecutor) {}

  /**
   * Runs `work` with the application row locked (SELECT … FOR UPDATE) inside one transaction:
   * a second instance submitting the same application waits, then sees SUBMITTED.
   * The owner check is part of the query (another citizen's row is never returned).
   */
  withSubmissionLock<T>(applicationId: string, citizenId: string, work: (app: LockedApplication, tx: SqlExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string; citizen_id: string; state: string; submission_id: string | null; version: number }>(
        "SELECT id, citizen_id, state, submission_id, version FROM applications WHERE id = $1 AND citizen_id = $2 FOR UPDATE",
        [applicationId, citizenId],
      );
      if (!row) throw new ConflictError("Application not found for this citizen");
      return work({ id: row.id, citizenId: row.citizen_id, state: row.state, submissionId: row.submission_id, version: row.version }, tx);
    });
  }

  /** Compare-and-set state change: succeeds only from `expectedVersion` and an allowed state. */
  async transition(
    applicationId: string,
    citizenId: string,
    expectedVersion: number,
    from: readonly string[],
    to: string,
    set: { consentAt?: string | null; signedAt?: string | null; signedPdfSha256?: string | null; submissionId?: string | null },
    tx: SqlExecutor = this.db,
  ): Promise<number> {
    const rows = await tx.query<{ version: number }>(
      `UPDATE applications
          SET state = $5,
              consent_at = CASE WHEN $6::boolean THEN $7::timestamptz ELSE consent_at END,
              signed_at = CASE WHEN $8::boolean THEN $9::timestamptz ELSE signed_at END,
              signed_pdf_sha256 = CASE WHEN $10::boolean THEN $11 ELSE signed_pdf_sha256 END,
              submission_id = CASE WHEN $12::boolean THEN $13::uuid ELSE submission_id END,
              version = version + 1,
              updated_at = now()
        WHERE id = $1 AND citizen_id = $2 AND version = $3 AND state = ANY($4)
        RETURNING version`,
      [
        applicationId,
        citizenId,
        expectedVersion,
        [...from],
        to,
        "consentAt" in set,
        set.consentAt ?? null,
        "signedAt" in set,
        set.signedAt ?? null,
        "signedPdfSha256" in set,
        set.signedPdfSha256 ?? null,
        "submissionId" in set,
        set.submissionId ?? null,
      ],
    );
    if (!rows[0]) throw new ConflictError("Application changed meanwhile or the transition is not allowed");
    return rows[0].version;
  }
}

/** Consultations: atomic compare-and-set on status, ownership in the WHERE clause. */
export class PgConsultationRepository {
  constructor(private readonly db: SqlExecutor) {}

  async transition(
    id: string,
    owner: { citizenId: string } | { professionalId: string },
    from: readonly ConsultationStatus[],
    to: ConsultationStatus,
    historyEntry: { status: ConsultationStatus; at: string; by: "citizen" | "professional" },
  ): Promise<void> {
    const byCitizen = "citizenId" in owner;
    // The owner column is chosen from two constants in code (never from input); values are parameters.
    const rows = await this.db.query(
      `UPDATE consultations
          SET status = $4,
              version = version + 1,
              updated_at = $5,
              data = jsonb_set(jsonb_set(data, '{status}', to_jsonb($4::text)), '{history}', (data->'history') || $6::jsonb)
        WHERE id = $1 AND ${byCitizen ? "citizen_id" : "professional_id"} = $2 AND status = ANY($3)
        RETURNING id`,
      [id, byCitizen ? owner.citizenId : owner.professionalId, [...from], to, historyEntry.at, JSON.stringify([historyEntry])],
    );
    if (!rows.length) throw new ConflictError("Consultation not found for this owner, or the transition is not allowed now");
  }
}

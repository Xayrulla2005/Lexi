import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LexiInitialSchema1763712000000 } from "./migrations/1763712000000-LexiInitialSchema";
import { NEVER_READ, planImport } from "./import-runtime-json";
import {
  AUDIT_LOCK_KEY,
  ConflictError,
  PgApplicationRepository,
  PgAuditRepository,
  PgConsultationRepository,
  PgIdempotencyRepository,
  type SqlExecutor,
  typeormExecutor,
} from "./pg-repositories";

/** Records every statement; `answer` decides the rows returned. Not a database (see report). */
function recorder(answer: (sql: string, params: readonly unknown[]) => unknown[] = () => []) {
  const log: { sql: string; params: readonly unknown[]; tx: boolean }[] = [];
  let inTx = false;
  const exec: SqlExecutor = {
    query: async <T>(sql: string, params: readonly unknown[] = []) => {
      log.push({ sql: sql.replace(/\s+/g, " ").trim(), params, tx: inTx });
      return answer(sql, params) as T[];
    },
    transaction: async (work) => {
      inTx = true;
      try {
        return await work(exec);
      } finally {
        inTx = false;
      }
    },
  };
  return { exec, log };
}

const APP = "8c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11";
const EVIL = "x'); DROP TABLE applications; --";

describe("PostgreSQL repositories (SQL shape; no live database)", () => {
  it("values are always parameters, never part of the SQL text", async () => {
    const { exec, log } = recorder(() => []);
    await new PgIdempotencyRepository(exec).reserve(EVIL, EVIL, APP);
    await expect(new PgApplicationRepository(exec).withSubmissionLock(EVIL, EVIL, async () => 1)).rejects.toBeInstanceOf(ConflictError);
    await expect(new PgConsultationRepository(exec).transition(EVIL, { citizenId: EVIL }, ["REQUESTED"], "CANCELLED", { status: "CANCELLED", at: "2026-11-21T00:00:00Z", by: "citizen" })).rejects.toBeInstanceOf(ConflictError);
    for (const l of log) expect(l.sql).not.toContain("DROP TABLE");
    expect(log.some((l) => l.params.includes(EVIL))).toBe(true);
  });

  it("submission: the application row is locked FOR UPDATE inside a transaction, filtered by owner", async () => {
    const { exec, log } = recorder((sql) => (sql.includes("FOR UPDATE") ? [{ id: APP, citizen_id: "c1", state: "SIGNED", submission_id: null, version: 3 }] : []));
    const seen = await new PgApplicationRepository(exec).withSubmissionLock(APP, "c1", async (app) => app.version);
    expect(seen).toBe(3);
    expect(log[0]).toMatchObject({ tx: true, params: [APP, "c1"] });
    expect(log[0]?.sql).toMatch(/WHERE id = \$1 AND citizen_id = \$2 FOR UPDATE$/);
  });

  it("transitions are compare-and-set: version + allowed states + owner; no row -> ConflictError", async () => {
    const { exec, log } = recorder((sql) => (sql.includes("RETURNING version") ? [] : []));
    const repo = new PgApplicationRepository(exec);
    await expect(repo.transition(APP, "c1", 2, ["CONSENTED"], "SIGNED", { signedAt: "2026-11-21T00:00:00Z" })).rejects.toBeInstanceOf(ConflictError);
    expect(log[0]?.sql).toContain("WHERE id = $1 AND citizen_id = $2 AND version = $3 AND state = ANY($4)");
    const ok = recorder(() => [{ version: 3 }]);
    expect(await new PgApplicationRepository(ok.exec).transition(APP, "c1", 2, ["CONSENTED"], "SIGNED", { signedAt: "2026-11-21T00:00:00Z" })).toBe(3);
  });

  it("idempotency: INSERT … ON CONFLICT DO NOTHING; a taken key returns the existing record", async () => {
    const { exec, log } = recorder((sql) => (sql.startsWith("SELECT") ? [{ application_id: APP, submission_id: null }] : []));
    expect(await new PgIdempotencyRepository(exec).reserve("h", "c1", APP)).toEqual({ applicationId: APP, submissionId: null });
    expect(log[0]?.sql).toContain("ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash");
    const fresh = recorder((sql) => (sql.startsWith("INSERT") ? [{ key_hash: "h" }] : []));
    expect(await new PgIdempotencyRepository(fresh.exec).reserve("h", "c1", APP)).toBeNull();
  });

  it("audit: advisory lock, chained to the last row, one INSERT (no UPDATE/DELETE)", async () => {
    const prev = "a".repeat(64);
    const { exec, log } = recorder((sql) => (sql.startsWith("SELECT seq") ? [{ seq: "41", hash: prev }] : []));
    const e = await new PgAuditRepository(exec).append({ type: "APPLICATION_CONSENTED", actor: { type: "citizen", id: "c1" }, applicationId: APP });
    expect(e.seq).toBe(42);
    expect(e.prevHash).toBe(prev);
    expect(log.map((l) => l.sql.split(" ")[0])).toEqual(["SELECT", "SELECT", "INSERT"]);
    expect(log[0]?.params).toEqual([AUDIT_LOCK_KEY]);
    expect(log.every((l) => l.tx)).toBe(true);
  });

  it("consultations: status CAS with the owner column in WHERE", async () => {
    const { exec, log } = recorder(() => [{ id: "x" }]);
    await new PgConsultationRepository(exec).transition("x", { professionalId: "p1" }, ["REQUESTED"], "ACCEPTED", { status: "ACCEPTED", at: "2026-11-21T00:00:00Z", by: "professional" });
    expect(log[0]?.sql).toContain("WHERE id = $1 AND professional_id = $2 AND status = ANY($3)");
  });
});

describe("typeormExecutor", () => {
  it("nested transactions reuse the outer transaction's manager (same connection and locks)", async () => {
    const calls: string[] = [];
    let opened = 0;
    const manager = { query: async (sql: string) => (calls.push(`tx:${sql}`), []) };
    const ds = {
      query: async (sql: string) => (calls.push(`ds:${sql}`), []),
      transaction: async (work: (m: typeof manager) => Promise<unknown>) => {
        opened++;
        return work(manager);
      },
    };
    const exec = typeormExecutor(ds as never);
    await exec.transaction(async (tx) => {
      await tx.query("A");
      await tx.transaction(async (inner) => inner.query("B"));
    });
    expect(opened).toBe(1);
    expect(calls).toEqual(["tx:A", "tx:B"]);
  });
});

describe("migration", () => {
  it("is additive, append-only for audit, and has no destructive down", async () => {
    const { exec, log } = recorder();
    const m = new LexiInitialSchema1763712000000();
    await m.up(exec as never);
    const all = log.map((l) => l.sql).join("\n");
    expect(all).not.toMatch(/\bDROP TABLE\b|\bTRUNCATE TABLE\b|\bDELETE FROM\b|\bALTER TABLE \w+ DROP\b/);
    expect(all).toContain("CREATE TABLE IF NOT EXISTS audit_events");
    expect(all).toContain("BEFORE UPDATE OR DELETE ON audit_events");
    expect(all).toContain("application_id uuid NOT NULL UNIQUE REFERENCES applications(id)");
    expect(all).toContain("key_hash char(64) PRIMARY KEY");
    expect(all).not.toMatch(/\btoken\b\s+(varchar|text)/); // no plaintext token column
    expect(all).toContain("BEFORE TRUNCATE ON audit_events");
    expect(all).toContain("FOREIGN KEY (application_id, citizen_id) REFERENCES applications (id, citizen_id)");
    expect(all).toContain("applications_submission_fk");
    await expect(m.down()).rejects.toThrow(/irreversible/);
  });
});

describe("JSON import plan (dry run)", () => {
  it("validates, counts duplicates and invalid records; never reads session files", () => {
    const dir = mkdtempSync(join(tmpdir(), "lex-import-"));
    const consult = {
      id: APP,
      citizenId: "test_fuqaro_1",
      professionalId: "test_yurist_1",
      caseId: null,
      message: "x",
      status: "REQUESTED",
      history: [{ status: "REQUESTED", at: "2026-11-21T00:00:00.000Z", by: "citizen" }],
      createdAt: "2026-11-21T00:00:00.000Z",
      updatedAt: "2026-11-21T00:00:00.000Z",
    };
    writeFileSync(join(dir, "consultations.json"), JSON.stringify({ a: consult, b: consult, c: { id: "broken" } }));
    writeFileSync(join(dir, "sessions.json"), "{ this is not even JSON");
    const plan = planImport(dir);
    expect(plan.summary.consultations).toEqual({ file: "consultations.json", present: true, valid: 1, invalid: 1, duplicates: 1 });
    expect(plan.summary.cases.present).toBe(false);
    expect(Object.values(plan.summary).map((s) => s.file)).not.toEqual(expect.arrayContaining([...NEVER_READ]));
  });
});

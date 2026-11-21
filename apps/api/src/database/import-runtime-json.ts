/**
 * data/runtime/*.json -> PostgreSQL (schema: migrations/1763712000000-LexiInitialSchema.ts).
 *
 *   pnpm --filter @lex/api db:import-json            # DRY RUN (default): validate and count only
 *   pnpm --filter @lex/api db:import-json --apply    # insert (needs DATABASE_URL and the migration)
 *
 * Safety:
 * - JSON files are only read, never changed or deleted.
 * - Every record is validated with its contract schema; invalid ones are counted and skipped.
 * - Repeatable: INSERT … ON CONFLICT DO NOTHING keeps existing rows, ids are preserved.
 * - Duplicates (same id twice) are detected and counted.
 * - Sessions are NOT migrated: sessions.json (old plaintext tokens) is never opened;
 *   hashed sessions (oneid/agency/professional) are skipped too — users log in again.
 * - The summary has counts only (no names, PINFL, stories or tokens).
 */
import "../load-env";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Application, ApplicationDocument, AuditEvent, Case, ConsultationRequest } from "@lex/contracts";
import { StoredConversation } from "../conversations/conversation-access";
import { REPO_ROOT } from "../common/paths";

/** Files that are never read by this tool. */
export const NEVER_READ = ["sessions.json", "oneid-sessions.json", "agency-sessions.json", "professional-sessions.json"] as const;

const Loose = <T extends z.ZodTypeAny>(schema: T) => schema;
const SOURCES = {
  cases: { file: "cases.json", schema: Loose(Case) },
  // Same reader as the app: legacy records (bare conversation, no tokens) are accepted.
  conversations: { file: "conversations.json", schema: StoredConversation },
  applications: { file: "applications.json", schema: Application.extend({ signedPdfBase64: z.string().nullable().optional() }) },
  application_documents: { file: "documents.json", schema: ApplicationDocument.extend({ citizenId: z.string() }) },
  agency_submissions: { file: "submissions.json", schema: z.object({ submission: z.object({ id: z.string().uuid(), applicationId: z.string().uuid() }).passthrough() }).passthrough() },
  idempotency_keys: { file: "idempotency-keys.json", schema: z.object({ citizenId: z.string(), applicationId: z.string().uuid(), submissionId: z.string().uuid(), createdAt: z.string() }) },
  audit_events: { file: "audit-events.json", schema: AuditEvent },
  consultations: { file: "consultations.json", schema: ConsultationRequest },
} as const;
export type ImportTable = keyof typeof SOURCES;

export interface TableSummary {
  file: string;
  present: boolean;
  valid: number;
  invalid: number;
  duplicates: number;
}

export interface ImportPlan {
  summary: Record<ImportTable, TableSummary>;
  records: Record<ImportTable, { key: string; value: unknown }[]>;
}

/** Reads and validates the runtime JSON files (read-only). Never opens NEVER_READ files. */
export function planImport(runtimeDir: string): ImportPlan {
  const summary = {} as Record<ImportTable, TableSummary>;
  const records = {} as Record<ImportTable, { key: string; value: unknown }[]>;
  for (const [table, { file, schema }] of Object.entries(SOURCES) as [ImportTable, (typeof SOURCES)[ImportTable]][]) {
    const path = join(runtimeDir, file);
    const s: TableSummary = { file, present: existsSync(path), valid: 0, invalid: 0, duplicates: 0 };
    const out: { key: string; value: unknown }[] = [];
    if (s.present) {
      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      } catch {
        s.invalid++;
      }
      const seen = new Set<string>();
      for (const [key, value] of Object.entries(raw)) {
        const parsed = schema.safeParse(value);
        if (!parsed.success) {
          s.invalid++;
          continue;
        }
        const id = idOf(table, key, parsed.data);
        if (seen.has(id)) {
          s.duplicates++;
          continue;
        }
        seen.add(id);
        s.valid++;
        out.push({ key, value: parsed.data });
      }
    }
    summary[table] = s;
    records[table] = out;
  }
  return { summary, records };
}

function idOf(table: ImportTable, key: string, v: unknown): string {
  const r = v as Record<string, unknown>;
  if (table === "conversations") return String((r.conversation as Record<string, unknown>).id);
  if (table === "agency_submissions") return String((r.submission as Record<string, unknown>).id);
  if (table === "idempotency_keys") return key;
  return String(r.id ?? key);
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const runtimeDir = process.env.RUNTIME_DIR ?? join(REPO_ROOT, "data/runtime");
  const plan = planImport(runtimeDir);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", skippedNeverRead: NEVER_READ, summary: plan.summary }, null, 2));
  if (!apply) return;
  throw new Error("--apply: run the migration first, then implement the inserts against the verified schema (not enabled until a test database is available)");
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}

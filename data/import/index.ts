/**
 * XAYRULLA: validates the team's legal data files.
 *   - data/agencies.csv
 *   - ai/eval/datasets/test_cases.csv
 *   - cross-references both against legal-knowledge/catalog/problems.json
 * Invalid rows are reported; the process exits with code 1 if any check fails (used in CI).
 * Run: pnpm import:data
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const ROOT = join(__dirname, "../..");
const AGENCIES = "data/agencies.csv";
const TEST_CASES = "ai/eval/datasets/test_cases.csv";
const CATALOG = "legal-knowledge/catalog/problems.json";

const ID = /^[a-z0-9_]+$/;
const RISK_UZ = { red: "qizil", orange: "to'q sariq", yellow: "sariq", green: "yashil" } as const;
/** Not an agency: "send a written demand to the other party first". Skipped when deriving birinchi_idora. */
const OTHER_PARTY = "qarshi_taraf";

const Agency = z.object({
  id: z.string().regex(ID, "id faqat kichik lotin harf, raqam va _"),
  nomi: z.string().min(2),
  vakolati: z.string(),
  shugullanmaydi: z.string(),
  kanal: z.string(),
  telefon: z.string(),
  javob_muddati: z.string().regex(/^\d*$/, "javob_muddati raqam bo'lishi kerak"),
  manba: z.string(),
});

const TestCase = z.object({
  id: z.string().regex(/^P\d{2}_(A|V)\d$/, "id formati P01_A1 yoki P01_V1 bo'lishi kerak"),
  soha: z.string().regex(ID),
  hikoya: z.string().min(10),
  xavf: z.enum(["qizil", "to'q sariq", "sariq", "yashil"]),
  birinchi_idora: z.string().regex(ID),
  hali_erta: z.string(),
  moddalar: z.string(),
  foydalanuvchi_xatosi: z.string(),
  izoh: z.string(),
  problem_id: z.string().regex(/^P\d{2}$/),
  uslub: z.enum(["rasmiy", "qisqa", "sheva", "aralash", "kirill"]),
  hudud: z.string(),
});
type TestCase = z.infer<typeof TestCase>;

/** Minimal view of the catalog needed for cross-checks (full schema lives in @lex/legal-engine). */
const Catalog = z.object({
  sohalar: z.record(z.string()),
  idoralar: z.record(z.object({ nomi: z.string() }).passthrough()),
  muammolar: z.array(
    z
      .object({ id: z.string(), soha: z.string(), xavf: z.enum(["red", "orange", "yellow", "green"]), organlar: z.array(z.string()) })
      .passthrough(),
  ),
});

/** CSV reader that respects quoted commas and newlines (stories contain both). */
function parseCsv(raw: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (q) {
      if (ch === '"' && raw[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.log(`✗ ${msg}`);
};

function check<T>(file: string, schema: z.ZodType<T>): { row: T; line: number }[] {
  const rows = parseCsv(readFileSync(join(ROOT, file), "utf8"));
  const valid: { row: T; line: number }[] = [];
  rows.forEach((r, i) => {
    const res = schema.safeParse(r);
    if (res.success) valid.push({ row: res.data, line: i + 2 });
    else fail(`${file} ${i + 2}-qator: ${res.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
  });
  console.log(`${valid.length === rows.length ? "✓" : "✗"} ${file}: ${valid.length}/${rows.length} qator to'g'ri`);
  return valid;
}

const catalog = Catalog.parse(JSON.parse(readFileSync(join(ROOT, CATALOG), "utf8")));
const problems = new Map(catalog.muammolar.map((m) => [m.id, m]));

const agencies = check(AGENCIES, Agency);
const agencyIds = new Set(agencies.map((a) => a.row.id));
for (const id of Object.keys(catalog.idoralar)) if (!agencyIds.has(id)) fail(`${AGENCIES}: katalogdagi "${id}" idorasi yo'q`);
for (const id of agencyIds) if (!(id in catalog.idoralar)) fail(`${AGENCIES}: "${id}" katalogda yo'q`);

const cases = check(TEST_CASES, TestCase);
const crossErrors = (tc: TestCase): string[] => {
  const errs: string[] = [];
  const p = problems.get(tc.problem_id);
  if (!p) return [`problem_id ${tc.problem_id} katalogda yo'q`];
  if (!tc.id.startsWith(`${tc.problem_id}_`)) errs.push(`id ${tc.id} problem_id ${tc.problem_id} bilan mos emas`);
  if (tc.soha !== p.soha) errs.push(`soha ${tc.soha} ≠ katalog ${p.soha}`);
  if (tc.xavf !== RISK_UZ[p.xavf]) errs.push(`xavf ${tc.xavf} ≠ katalog ${RISK_UZ[p.xavf]}`);
  const expectedFirst = p.organlar.find((o) => o !== OTHER_PARTY);
  if (tc.birinchi_idora !== expectedFirst) errs.push(`birinchi_idora ${tc.birinchi_idora} ≠ ${expectedFirst ?? "(yo'q)"}`);
  const agencyRefs = [tc.birinchi_idora, ...tc.hali_erta.split(";").map((s) => s.trim()).filter(Boolean)];
  for (const a of agencyRefs) if (!agencyIds.has(a)) errs.push(`noma'lum idora ${a}`);
  return errs;
};
let crossOk = 0;
for (const { row, line } of cases) {
  const errs = crossErrors(row);
  if (errs.length) fail(`${TEST_CASES} ${line}-qator (${row.id}): ${errs.join("; ")}`);
  else crossOk++;
}
console.log(`${crossOk === cases.length ? "✓" : "✗"} ${TEST_CASES}: ${crossOk}/${cases.length} katalog bilan mos`);
const ids = new Set(cases.map((c) => c.row.id));
if (ids.size !== cases.length) fail(`${TEST_CASES}: takrorlangan id'lar bor`);
const covered = new Set(cases.map((c) => c.row.problem_id));
const uncovered = [...problems.keys()].filter((id) => !covered.has(id));
if (uncovered.length) fail(`${TEST_CASES}: hikoyasi yo'q muammolar: ${uncovered.join(", ")}`);

process.exitCode = failed ? 1 : 0;

/**
 * Accuracy check: runs every story in ai/eval/datasets/test_cases.csv through
 * analyze() + the routing engine and compares with the expected answers.
 *
 * Run: pnpm eval:ai                      (offline; makes no paid API calls)
 *      pnpm eval:ai --label llm-gemini   (report name: <date>-<label>.json)
 *      pnpm eval:ai --out path/to/report.json
 *
 * Metrics:
 *   - problemId accuracy (null counts as a prediction);
 *   - domain accuracy;
 *   - red-risk recall (stories with xavf = qizil detected as red);
 *   - first-agency accuracy: decision.agencyId vs birinchi_idora
 *     (= first of `organlar` that is not qarshi_taraf);
 *   - all of the above per style (uslub).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createDefaultRoutingEngine } from "@lex/legal-engine";
import { analyze } from "../index";

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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface CaseResult {
  id: string;
  style: string;
  expected: { problemId: string; domain: string; red: boolean; firstAgency: string };
  predicted: { problemId: string | null; domain: string; riskLevel: string; routeType: string; firstAgency: string | null };
}

interface Counts {
  cases: number;
  problemId: number;
  domain: number;
  firstAgency: number;
  redTotal: number;
  redCaught: number;
}

const empty = (): Counts => ({ cases: 0, problemId: 0, domain: 0, firstAgency: 0, redTotal: 0, redCaught: 0 });
const pct = (a: number, b: number): number | null => (b ? Math.round((a / b) * 1000) / 10 : null);

function add(c: Counts, r: CaseResult): void {
  c.cases++;
  if (r.predicted.problemId === r.expected.problemId) c.problemId++;
  if (r.predicted.domain === r.expected.domain) c.domain++;
  if (r.predicted.firstAgency === r.expected.firstAgency) c.firstAgency++;
  if (r.expected.red) {
    c.redTotal++;
    if (r.predicted.riskLevel === "red") c.redCaught++;
  }
}

function metrics(c: Counts) {
  return {
    cases: c.cases,
    problemIdAccuracy: pct(c.problemId, c.cases),
    domainAccuracy: pct(c.domain, c.cases),
    redRecall: pct(c.redCaught, c.redTotal),
    redCases: c.redTotal,
    firstAgencyAccuracy: pct(c.firstAgency, c.cases),
  };
}

async function main(): Promise<void> {
  const file = join(__dirname, "datasets/test_cases.csv");
  const rows = parseCsv(readFileSync(file, "utf8")).filter((c) => c.hikoya);
  const engine = createDefaultRoutingEngine();

  const results: CaseResult[] = [];
  for (const c of rows) {
    const analysis = await analyze({ text: c.hikoya });
    const { decision } = engine.route({ analysis });
    results.push({
      id: c.id,
      style: c.uslub,
      expected: { problemId: c.problem_id, domain: c.soha, red: c.xavf === "qizil", firstAgency: c.birinchi_idora },
      predicted: {
        problemId: analysis.classification.problemId,
        domain: analysis.classification.domain,
        riskLevel: analysis.risk.level,
        routeType: decision.routeType,
        firstAgency: decision.agencyId,
      },
    });
  }

  const total = empty();
  const byStyle = new Map<string, Counts>();
  for (const r of results) {
    add(total, r);
    if (!byStyle.has(r.style)) byStyle.set(r.style, empty());
    add(byStyle.get(r.style) as Counts, r);
  }

  const styleOrder = ["rasmiy", "qisqa", "sheva", "aralash", "kirill"];
  const styles = [...byStyle.keys()].sort(
    (a, b) => (styleOrder.indexOf(a) + 1 || 99) - (styleOrder.indexOf(b) + 1 || 99) || a.localeCompare(b),
  );
  const summary = metrics(total);
  const perStyle = Object.fromEntries(styles.map((s) => [s, metrics(byStyle.get(s) as Counts)]));

  const fmt = (v: number | null) => (v === null ? "—" : `${v}%`);
  const table = Object.fromEntries(
    [["JAMI", summary] as const, ...styles.map((s) => [s, perStyle[s]] as const)].map(([name, m]) => [
      name,
      {
        "Hikoyalar": m!.cases,
        "problemId": fmt(m!.problemIdAccuracy),
        "Soha": fmt(m!.domainAccuracy),
        "1-idora": fmt(m!.firstAgencyAccuracy),
        "Qizil recall": `${fmt(m!.redRecall)} (${m!.redCases})`,
      },
    ]),
  );
  console.table(table);

  // Local calendar date (the team works in UTC+5; toISOString() would give the UTC day).
  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  const label = arg("label") ?? "baseline";
  const out = resolve(arg("out") ?? join(__dirname, "reports", `${date}-${label}.json`));
  const report = {
    label,
    classifier: label === "baseline" ? "keyword (ai/pipeline/classify.ts)" : label,
    generatedAt: new Date().toISOString(),
    dataset: relative(join(__dirname, "../.."), file).replace(/\\/g, "/"),
    summary,
    perStyle,
    errors: results.filter(
      (r) =>
        r.predicted.problemId !== r.expected.problemId ||
        r.predicted.firstAgency !== r.expected.firstAgency ||
        (r.expected.red && r.predicted.riskLevel !== "red"),
    ),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Hisobot: ${relative(process.cwd(), out)}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});

/**
 * Accuracy check: runs every story in ai/eval/datasets/test_cases.csv through
 * analyze() + the routing engine and compares with the expected answers.
 * Run: pnpm eval:ai   (offline; makes no paid API calls)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createDefaultRoutingEngine } from "@lex/legal-engine";
import { analyze } from "../index";

/** CSV reader that respects quoted commas (stories contain commas). */
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

async function main() {
  const file = join(__dirname, "datasets/test_cases.csv");
  const cases = parseCsv(readFileSync(file, "utf8")).filter((c) => c.hikoya);
  const engine = createDefaultRoutingEngine();

  let domain = 0, agency = 0, criticalTotal = 0, criticalCaught = 0;
  for (const c of cases) {
    const analysis = await analyze({ text: c.hikoya });
    const { decision } = engine.route({ analysis });
    if (analysis.classification.domain === c.soha) domain++;
    if (decision.agencyId === c.birinchi_idora) agency++;
    if (c.xavf === "qizil") { criticalTotal++; if (analysis.risk.level === "red") criticalCaught++; }
  }

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  console.table({
    "Cases": cases.length,
    "Domain accuracy %": pct(domain, cases.length),
    "First agency %": pct(agency, cases.length),
    "CRITICAL recall %": pct(criticalCaught, criticalTotal),
  });
}

main();

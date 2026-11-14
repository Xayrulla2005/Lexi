/**
 * Aniqlik o'lchovi: data/raw/test_cases.csv dagi har hikoyani analyze() dan
 * o'tkazib, Mirjalolning to'g'ri javobi bilan solishtiradi.
 * Ishga tushirish: pnpm --filter @lex/ai eval
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyze } from "../src";

/** Qo'shtirnoq ichidagi vergullarni hisobga oluvchi CSV o'quvchi (hikoyalarda vergul bo'ladi) */
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
  const file = join(__dirname, "../../../data/raw/test_cases.csv");
  const cases = parseCsv(readFileSync(file, "utf8")).filter((c) => c.hikoya);

  let category = 0, agency = 0, redTotal = 0, redCaught = 0;
  for (const c of cases) {
    const r = await analyze({ text: c.hikoya });
    if (r.category === c.soha) category++;
    if (r.agency_candidates[0] === c.birinchi_idora) agency++;
    if (c.xavf === "qizil") { redTotal++; if (r.risk.level === "red") redCaught++; }
  }

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  console.table({
    "Holatlar soni": cases.length,
    "Soha to'g'riligi %": pct(category, cases.length),
    "Birinchi idora %": pct(agency, cases.length),
    "Qizil xavf recall %": pct(redCaught, redTotal),
  });
}

main();

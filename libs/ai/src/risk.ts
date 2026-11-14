import type { AnalysisResult, RiskLevel } from "@lex/contracts";

/**
 * 1-qavat: kalit so'zlar (har doim ishlaydi, LLM'siz).
 * 2-qavat: tez LLM — Jayhun qo'shadi. Ikkalasidan yuqoriroq daraja olinadi.
 */
const RED = [
  "o'ldiraman", "o'ldirmoqchi", "pichoq", "qurol", "o'zimni o'ldir",
  "hozir uryapti", "urayapti", "qamab qo'ydi", "yordam bering tez",
];
const ORANGE = ["urdi", "tahdid", "qo'rqyapman", "qo'rqaman", "urib qo'yaman"];

const ORDER: RiskLevel[] = ["green", "yellow", "orange", "red"];
const max = (a: RiskLevel, b: RiskLevel) =>
  ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;

export async function riskFilter(text: string): Promise<AnalysisResult["risk"]> {
  const reasons: string[] = [];
  let level: RiskLevel = "yellow";

  for (const w of RED) if (text.includes(w)) { level = max(level, "red"); reasons.push(w); }
  for (const w of ORANGE) if (text.includes(w)) { level = max(level, "orange"); reasons.push(w); }

  // TODO(Jayhun): const llm = await llmRisk(text); level = max(level, llm.level)
  return { level, reasons };
}

import type { RiskAssessment, RiskLevel } from "@lex/contracts";

/**
 * Layer 1: keyword safety net — always runs, needs no LLM, so emergencies are
 * caught even when the model is unavailable.
 * Layer 2 (TODO, Jayhun): LLM risk assessment; take the higher of the two levels.
 * Input is expected to be normalized (lowercase latin) — see normalize.ts.
 */
const CRITICAL = [
  "o'ldiraman", "o'ldirmoqchi", "pichoq", "qurol", "o'zimni o'ldir",
  "hozir uryapti", "urayapti", "qamab qo'ydi", "yordam bering tez",
];
const HIGH = ["urdi", "tahdid", "qo'rqyapman", "qo'rqaman", "urib qo'yaman"];

const ORDER: readonly RiskLevel[] = ["LOW", "NORMAL", "HIGH", "CRITICAL"];
export const maxRisk = (a: RiskLevel, b: RiskLevel): RiskLevel => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

export function keywordRisk(text: string): RiskAssessment {
  const signals: string[] = [];
  let level: RiskLevel = "NORMAL";

  for (const w of CRITICAL) if (text.includes(w)) { level = maxRisk(level, "CRITICAL"); signals.push(w); }
  for (const w of HIGH) if (text.includes(w)) { level = maxRisk(level, "HIGH"); signals.push(w); }

  return { level, signals, requiresImmediateAction: level === "CRITICAL" };
}

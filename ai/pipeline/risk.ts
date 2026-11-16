import type { RiskAssessment, RiskLevel } from "@lex/contracts";

/**
 * Layer 1: keyword safety net — always runs, needs no LLM, so emergencies are
 * caught even when the model is unavailable.
 * Layer 2 (TODO, Jayhun): LLM risk assessment; take the higher of the two levels.
 * Input is expected to be normalized (lowercase latin) — see normalize.ts.
 */
const RED = [
  "o'ldiraman", "o'ldirmoqchi", "pichoq", "qurol", "o'zimni o'ldir",
  "hozir uryapti", "urayapti", "qamab qo'ydi", "yordam bering tez",
];
const ORANGE = ["urdi", "tahdid", "qo'rqyapman", "qo'rqaman", "urib qo'yaman"];

const ORDER: readonly RiskLevel[] = ["green", "yellow", "orange", "red"];
export const maxRisk = (a: RiskLevel, b: RiskLevel): RiskLevel => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

export function keywordRisk(text: string): RiskAssessment {
  const signals: string[] = [];
  let level: RiskLevel = "yellow";

  for (const w of RED) if (text.includes(w)) { level = maxRisk(level, "red"); signals.push(w); }
  for (const w of ORANGE) if (text.includes(w)) { level = maxRisk(level, "orange"); signals.push(w); }

  return { level, signals, requiresImmediateAction: level === "red" };
}

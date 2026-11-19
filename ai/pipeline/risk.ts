import type { RiskAssessment, RiskLevel } from "@lex/contracts";

/**
 * Layer 1: keyword safety net — always runs, needs no LLM, so emergencies are
 * caught even when the model is unavailable. Layer 2 is the LLM risk; the final
 * level is max(keyword, LLM). Input must be normalized (lowercase latin, Cyrillic
 * transliterated, apostrophes unified) — see normalize.ts.
 *
 * These are general safety rules for threats (in Uzbek and Russian), not a fit to the
 * eval set: a threat must never be shown as an ordinary dispute.
 */

/** Word start: beginning of text or a non-letter (the apostrophe belongs to the word: o'ldir). */
const W = "(?:^|[^a-z'])";

interface Rule {
  signal: string;
  pattern: RegExp;
}
const rule = (signal: string, body: string): Rule => ({ signal, pattern: new RegExp(`${W}(?:${body})`) });

/** Threats to life/health, weapons, ongoing violence -> red. */
const RED: readonly Rule[] = [
  rule("o'ldiraman", "o'?ldir(?:aman|amiz|adi|moqchi|ib qo'yaman)"),
  rule("so'yaman", "so'?y(?:aman|amiz|ib tashlayman)"),
  rule("pichoq", "pichoq"),
  rule("qurol", "qurol"),
  rule("o'zimni o'ldir", "o'zimni o'ldir"),
  rule("hozir uryapti", "hozir ur(?:yapti|ayapti)"),
  rule("urayapti", "urayapti"),
  rule("qamab qo'ydi", "qamab qo'y"),
  rule("yordam bering tez", "yordam bering tez"),
  // Russian (after transliteration): убью, убьёт, зарежу
  rule("убью", "ubyu|ubyot|zarejyu"),
];

/** Threats, intimidation, beating -> at least orange (and 102 is shown). */
const ORANGE: readonly Rule[] = [
  rule("urdi", "urdi"),
  rule("uraman", "ur(?:aman|amiz|adi|adilar|ib qo'yaman)"),
  rule("do'q", "do'?q(?![a-z])"),
  rule("qo'rqitish", "qo'?rqit"),
  rule("qo'rqaman", "qo'?rq(?:yapman|aman)"),
  rule("tahdid", "tahdid"),
  // Russian: угрожает / угроза (after transliteration)
  rule("угрожает", "ugroj|ugroz"),
];

const ORDER: readonly RiskLevel[] = ["green", "yellow", "orange", "red"];
export const maxRisk = (a: RiskLevel, b: RiskLevel): RiskLevel => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

export function keywordRisk(text: string): RiskAssessment {
  const signals: string[] = [];
  let level: RiskLevel = "yellow";
  for (const r of RED) if (r.pattern.test(text)) { level = maxRisk(level, "red"); signals.push(r.signal); }
  for (const r of ORANGE) if (r.pattern.test(text)) { level = maxRisk(level, "orange"); signals.push(r.signal); }
  return { level, signals, requiresImmediateAction: level === "red" };
}

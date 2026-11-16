import type { Classification, LegalDomain, ProblemId } from "@lex/contracts";

/**
 * Keyword baseline classifier for offline development, CI and the eval baseline.
 * TODO(Jayhun): replace with the LLM structured output from prompts/analysis.prompt.ts.
 *
 * Input must be normalized (lowercase latin, apostrophes unified) — see normalize.ts,
 * which also transliterates Cyrillic, so "ойлик" / "маош" arrive as "oylik" / "maosh".
 * Rules are checked in order; the first match wins. No match -> problemId null (fallback route).
 */

/** Word start: beginning of text or a non-letter (apostrophe counts as a letter: o'z, so'kdi). */
const W = "(?:^|[^a-z'äöüğıñşç])";

interface Rule {
  problemId: ProblemId;
  domain: LegalDomain;
  pattern: RegExp;
}

const RULES: readonly Rule[] = [
  {
    // oylik / maosh / ish haqi; Xorazm "ayliq"; Russian-mixed "zarplata".
    problemId: "P12",
    domain: "mehnat",
    pattern: new RegExp(`${W}(?:oyli[kgq]|ayli[kgqğ]|maosh|maash|ish haq|zarplat)`),
  },
  {
    // urdi / uradi / zo'ravonlik (+ other forms of "urmoq": urib, uryapti, urvotti).
    problemId: "P25",
    domain: "zoravonlik",
    pattern: new RegExp(`${W}(?:ur(?:di|adi|ib|ish|yap|ayap|vot|ar)|zo'?ravon)`),
  },
  {
    // so'kdi / haqorat (+ so'kadi, so'kib, so'kinadi; Russian-mixed "oskorbl...").
    problemId: "P42",
    domain: "jamoat_tartibi",
    pattern: new RegExp(`${W}(?:s[oö]'?k(?:di|adi|ib|in|yap|vot)|haqorat|xaqorat|oskorbl)`),
  },
  {
    // qo'shni / shovqin (+ dialect "qoshni", "shavqin"; Russian-mixed "sosed").
    problemId: "P44",
    domain: "qoshnichilik",
    pattern: new RegExp(`${W}(?:q[oö]'?shn|shovqin|shavqin|sosed)`),
  },
];

/** Keyword matches are never confident enough to skip human review on their own merit. */
const MATCH_CONFIDENCE = 0.7;
const NO_MATCH: Classification = { domain: "davlat_organlari", problemId: null, confidence: 0.3 };

export function classify(text: string): Classification {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return { domain: rule.domain, problemId: rule.problemId, confidence: MATCH_CONFIDENCE };
  }
  return { ...NO_MATCH };
}

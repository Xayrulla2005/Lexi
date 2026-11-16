import type { Classification } from "@lex/contracts";

/**
 * Keyword stub classifier for offline development and CI.
 * TODO(Jayhun): replace with the LLM structured output from prompts/analysis.prompt.ts.
 * Input is expected to be normalized (lowercase latin).
 */
const RULES: readonly { pattern: RegExp; result: Classification }[] = [
  {
    pattern: /oylik|maosh|ish haqi/,
    result: { domain: "mehnat", problemId: "P12", confidence: 0.8 },
  },
  {
    pattern: /qo'shni/,
    result: { domain: "qoshnichilik", problemId: "P44", confidence: 0.7 },
  },
  {
    pattern: /erim|turmush o'rtog'im|qaynona/,
    result: { domain: "zoravonlik", problemId: "P25", confidence: 0.6 },
  },
];

export function classify(text: string): Classification {
  for (const rule of RULES) if (rule.pattern.test(text)) return { ...rule.result };
  return { domain: "davlat_organlari", problemId: null, confidence: 0.3 };
}

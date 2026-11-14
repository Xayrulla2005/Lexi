import type { AnalysisResult } from "@lex/contracts";
import type { LawSource } from "./retrieve";

/**
 * Tekshiruvchi: qidiruvda topilmagan moddalarni o'chiradi,
 * ishonch past bo'lsa yuristga yo'naltiradi.
 * TODO(Jayhun): alohida LLM chaqiruvi — bir tomonlamalik va haqoratni tekshirish.
 */
export function verify(result: AnalysisResult, sources: LawSource[]): AnalysisResult {
  const known = new Set(sources.map((s) => s.id));
  const keep = <T extends { source_id: string }>(xs: T[]) =>
    xs.filter((x) => known.has(x.source_id));

  const rights = keep(result.rights);
  const obligations = keep(result.obligations);
  const needs_lawyer = result.needs_lawyer || result.confidence < 0.6;

  return { ...result, rights, obligations, needs_lawyer };
}

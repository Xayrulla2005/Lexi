import type { Category } from "@lex/contracts";

export interface ClassifyResult {
  category: Category;
  subcase: string | null;
  agency_candidates: string[];
  too_early: string[];
  confidence: number;
}

/** Hikoya -> soha va idora. Hozircha kalit so'z bilan; Jayhun LLM bilan almashtiradi. */
export async function classify(text: string): Promise<ClassifyResult> {
  if (/oylik|maosh|ish haqi|ish haqim/.test(text)) {
    return {
      category: "mehnat",
      subcase: "ish_haqi_tolanmagan",
      agency_candidates: ["mehnat_inspeksiyasi"],
      too_early: ["virtual_qabulxona", "prokuratura"],
      confidence: 0.8,
    };
  }
  // TODO(Jayhun): LLM structured output, idoralar faqat agencies.csv enum'idan
  return {
    category: "davlat_organlari",
    subcase: null,
    agency_candidates: [],
    too_early: [],
    confidence: 0.3,
  };
}

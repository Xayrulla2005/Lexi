/**
 * Jayhun egaligidagi modul. Tashqi dunyoga faqat analyze() chiqadi.
 *
 * Zanjir:
 *   normalize -> riskFilter -> retrieve (RAG) -> classify -> analyzeCase -> verify
 *
 * Hozircha har bir qadam soddalashtirilgan "stub". Jayhun ularni
 * haqiqiy LLM / embedding chaqiruvlari bilan almashtiradi.
 * analyze() ning imzosi va qaytaradigan sxemasi o'zgarmasligi shart.
 */
import { AnalysisResult, AnalyzeInput } from "@lex/contracts";
import { normalize } from "./normalize";
import { riskFilter } from "./risk";
import { retrieve } from "./retrieve";
import { classify } from "./classify";
import { verify } from "./verify";

export async function analyze(input: AnalyzeInput): Promise<AnalysisResult> {
  const parsed = AnalyzeInput.parse(input);
  const text = normalize(parsed.text);

  const risk = await riskFilter(text);
  const sources = await retrieve(text);
  const cls = await classify(text);

  const draft: AnalysisResult = {
    risk,
    category: cls.category,
    subcase: cls.subcase,
    agency_candidates: cls.agency_candidates,
    too_early: cls.too_early,
    analysis: {
      object: "",
      objective_side: "",
      subject: "",
      subjective_side: "",
    },
    rights: sources.slice(0, 1).map((s) => ({ text: s.title, source_id: s.id })),
    obligations: [],
    user_mistakes: [],
    evidence_needed: [],
    missing_info: [],
    confidence: cls.confidence,
    needs_lawyer: false,
  };

  // Sxema buzilgan bo'lsa shu yerda xato beradi — API ga noto'g'ri ma'lumot ketmaydi
  return AnalysisResult.parse(verify(draft, sources));
}

export { riskFilter } from "./risk";
export type { LawSource } from "./retrieve";

/**
 * analyze(): user story -> validated AnalysisResult.
 *
 *   normalize -> keyword risk + keyword classification (always, offline safety net)
 *             -> LLM classification (LLM_PROVIDER=gemini|huggingface; optional)
 *             -> risk = max(keyword, LLM); confidence < 0.5 -> problemId null (fallback)
 *             -> schema validation
 *
 * The LLM only classifies. Routing (agency, steps) is decided by @lex/legal-engine.
 * If the LLM is unavailable or fails, the keyword result is used and meta.degraded = true.
 */
import { ANALYSIS_SCHEMA_VERSION, type AnalysisMeta, AnalysisResult, AnalyzeInput, type Classification } from "@lex/contracts";
import { defaultChatProvider, type ProviderChoice } from "../models/select";
import { CLASSIFY_PROMPT_VERSION } from "../prompts/classify.prompt";
import { AllowlistCitationValidator } from "../rag/citation-validator";
import type { CitationValidator, DocumentRetriever } from "../rag/interfaces";
import { InMemoryRetriever } from "../rag/retrieve";
import { classify } from "./classify";
import { classifyWithLlm } from "./llm-classify";
import { normalize } from "./normalize";
import { keywordRisk, maxRisk } from "./risk";

export const HUMAN_REVIEW_CONFIDENCE = 0.6;

export interface AnalyzeDependencies {
  retriever: DocumentRetriever;
  citationValidator: CitationValidator;
  /** Chat model choice; defaults to LLM_PROVIDER from the environment. */
  chat?: ProviderChoice;
}

const defaultDeps: AnalyzeDependencies = {
  retriever: new InMemoryRetriever(),
  citationValidator: new AllowlistCitationValidator(),
};

export async function analyze(input: AnalyzeInput, deps: AnalyzeDependencies = defaultDeps): Promise<AnalysisResult> {
  const parsed = AnalyzeInput.parse(input);
  const text = normalize(parsed.text);
  const choice = deps.chat ?? defaultChatProvider();

  const keyword = keywordRisk(text);
  let risk = keyword;
  let classification: Classification = classify(text);
  const meta: AnalysisMeta = {
    provider: choice.name,
    model: null,
    degraded: choice.name !== "keyword" && !choice.provider,
    reason: null,
    latencyMs: null,
    promptVersion: null,
    candidates: [],
  };

  if (choice.provider) {
    const t0 = performance.now();
    try {
      const llm = await classifyWithLlm(choice.provider, parsed.text);
      classification = { domain: llm.domain, problemId: llm.problemId, confidence: llm.confidence };
      const level = maxRisk(keyword.level, llm.risk);
      risk = {
        level,
        signals: llm.risk === keyword.level ? keyword.signals : [...keyword.signals, `llm:${llm.risk}`],
        requiresImmediateAction: level === "red",
      };
      meta.model = choice.provider.id ?? null;
      meta.reason = llm.reason;
      meta.promptVersion = CLASSIFY_PROMPT_VERSION;
      meta.candidates = [llm.rawProblemId, llm.alternativeProblemId].filter((p): p is NonNullable<typeof p> => p !== null);
    } catch {
      // Provider/output error: keep the keyword result. Details are not logged here (no user text in logs).
      meta.degraded = true;
    }
    meta.latencyMs = Math.round(performance.now() - t0);
  }

  const sources = await deps.retriever.retrieve({ text, domain: classification.domain });
  const { accepted } = deps.citationValidator.validate([], sources);

  const draft: AnalysisResult = {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    caseSummary: parsed.text.slice(0, 280),
    classification,
    risk,
    facts: [{ statement: parsed.text, source: "USER_REPORTED" }],
    missingInformation: [],
    legalReferences: accepted,
    followUpQuestions: [],
    needsHumanReview:
      meta.degraded || classification.confidence < HUMAN_REVIEW_CONFIDENCE || classification.problemId === null,
    meta,
  };

  // Throws if the result violates the contract — invalid data never reaches the API.
  return AnalysisResult.parse(draft);
}

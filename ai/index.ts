/**
 * @lex/ai — AI analysis for LEX-DISPATCHER (owner: Jayhun).
 *
 * The public surface is analyze() plus the model/RAG abstractions.
 * AI output is advisory: routing is decided by @lex/legal-engine.
 */
export { analyze, HUMAN_REVIEW_CONFIDENCE, type AnalyzeDependencies } from "./pipeline/analyze";
export { normalize, transliterate } from "./pipeline/normalize";
export { keywordRisk, maxRisk } from "./pipeline/risk";
export { classify } from "./pipeline/classify";

export { loadModelConfig, DEFAULT_MODELS, type ModelConfig } from "./models/config";
export * from "./models/provider";
export { HuggingFaceProvider } from "./models/huggingface.provider";

export * from "./rag/interfaces";
export { InMemoryRetriever } from "./rag/retrieve";
export { AllowlistCitationValidator } from "./rag/citation-validator";

export {
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisMessages,
  formatSources,
} from "./prompts/analysis.prompt";

export {
  getArticlesForProblem,
  missingArticlesForProblem,
  retrieveForAnalysis,
  RAG_EXTRA_K,
  RAG_ONLY_K,
  type ArticleSource,
  type RetrievedArticle,
} from "./rag/catalog-retrieval";
export { getIndex, retrieve, warmUp, type RetrievedChunk } from "./rag/legal-index";

export { GeminiProvider, GeminiRequestError, geminiFromEnv } from "./models/gemini.provider";
export { defaultChatProvider, llmProviderName, selectChatProvider, type LlmProviderName, type ProviderChoice } from "./models/select";
export { classifyWithLlm, MIN_LLM_CONFIDENCE, type LlmClassification } from "./pipeline/llm-classify";
export { CLASSIFY_PROMPT_VERSION, classifySystemPrompt } from "./prompts/classify.prompt";
export { fieldContexts, isDontKnow, runIntake, MAX_QUESTIONS, type FieldContext, type IntakeResult } from "./pipeline/intake";
export { analyzeWithArticles } from "./pipeline/legal-analysis";
export { filterClaimCitations, type CitedClaim } from "./rag/citation-validator";

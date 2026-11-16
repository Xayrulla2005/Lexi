/**
 * analyze(): user story -> validated AnalysisResult.
 *
 *   normalize -> keyword risk -> retrieve (RAG) -> classify -> citation validation -> schema validation
 *
 * Current state: offline stub (keyword classifier, empty corpus by default).
 * The LLM step (prompts/analysis.prompt.ts + models/huggingface.provider.ts)
 * plugs in between retrieve and citation validation. The signature and the
 * returned schema must not change.
 */
import { ANALYSIS_SCHEMA_VERSION, AnalysisResult, AnalyzeInput } from "@lex/contracts";
import { AllowlistCitationValidator } from "../rag/citation-validator";
import type { CitationValidator, DocumentRetriever } from "../rag/interfaces";
import { InMemoryRetriever } from "../rag/retrieve";
import { classify } from "./classify";
import { normalize } from "./normalize";
import { keywordRisk } from "./risk";

export const HUMAN_REVIEW_CONFIDENCE = 0.6;

export interface AnalyzeDependencies {
  retriever: DocumentRetriever;
  citationValidator: CitationValidator;
}

const defaultDeps: AnalyzeDependencies = {
  retriever: new InMemoryRetriever(),
  citationValidator: new AllowlistCitationValidator(),
};

export async function analyze(input: AnalyzeInput, deps: AnalyzeDependencies = defaultDeps): Promise<AnalysisResult> {
  const parsed = AnalyzeInput.parse(input);
  const text = normalize(parsed.text);

  const risk = keywordRisk(text);
  const classification = classify(text);
  const sources = await deps.retriever.retrieve({ text, domain: classification.domain });

  // Stub: no model yet, so no candidate references. The LLM output goes here.
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
    needsHumanReview: classification.confidence < HUMAN_REVIEW_CONFIDENCE || classification.problemId === null,
  };

  // Throws if the result violates the contract — invalid data never reaches the API.
  return AnalysisResult.parse(draft);
}

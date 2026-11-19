import { z } from "zod";
import { Classification, ProblemId } from "./classification";
import { IsoDateTime, ReviewStatus, Slug } from "./common";

/** 2.0: catalog-based classification (problemId), catalog risk levels, LegalReference.status. */
export const ANALYSIS_SCHEMA_VERSION = "2.0" as const;

/** Risk levels as used in the legal catalog (`xavf`). `red` forces the emergency route. */
export const RiskLevel = z.enum(["red", "orange", "yellow", "green"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const RiskAssessment = z.object({
  level: RiskLevel,
  /** Human-readable signals that led to the level (e.g. matched keywords). */
  signals: z.array(z.string()),
  /** True when the person may be in immediate danger. Forces emergency routing. */
  requiresImmediateAction: z.boolean(),
});
export type RiskAssessment = z.infer<typeof RiskAssessment>;

/**
 * A law cited for a case. Catalog laws (`qonunlar`) are plain citations such as
 * "Mehnat kodeksi 253-modda" — they have no document id, separate article or URL yet.
 */
export const LegalReference = z.object({
  /** Id of a source document in legal-knowledge/ when one exists; null for catalog citations. */
  documentId: Slug.nullable(),
  /** Citation text exactly as in the source (catalog: the full `qonunlar` entry). */
  documentName: z.string().min(1),
  /** Article number when known separately; null otherwise. */
  article: z.string().min(1).nullable(),
  sourceUrl: z.string().url().nullable(),
  /** Legal review status. Anything other than VERIFIED must be shown with a review notice. */
  status: ReviewStatus,
  /** null while never verified. */
  lastVerifiedAt: IsoDateTime.nullable(),
});
export type LegalReference = z.infer<typeof LegalReference>;

/** Where a fact comes from: stated by the user, or assumed by the model. */
export const FactSource = z.enum(["USER_REPORTED", "ASSUMPTION"]);
export type FactSource = z.infer<typeof FactSource>;

export const Fact = z.object({
  statement: z.string().min(1),
  source: FactSource,
});
export type Fact = z.infer<typeof Fact>;

/** How the analysis was produced. `degraded` = the chosen LLM failed or had no key, keyword fallback used. */
export const AnalysisMeta = z.object({
  provider: z.enum(["gemini", "huggingface", "keyword"]),
  /** "<backend>:<model>" of the LLM actually used; null for keyword. */
  model: z.string().nullable(),
  degraded: z.boolean(),
  /** One-sentence classification reason from the LLM; null for keyword. */
  reason: z.string().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  promptVersion: z.string().nullable(),
  /** LLM's top-2 problem types before the confidence gate (for one disambiguating question). */
  candidates: z.array(ProblemId).max(2).default([]),
});
export type AnalysisMeta = z.infer<typeof AnalysisMeta>;

/** Structured AI output. The AI never decides routing — see RoutingDecision. */
export const AnalysisResult = z.object({
  schemaVersion: z.literal(ANALYSIS_SCHEMA_VERSION),
  caseSummary: z.string(),
  classification: Classification,
  risk: RiskAssessment,
  facts: z.array(Fact),
  missingInformation: z.array(z.string()),
  legalReferences: z.array(LegalReference),
  followUpQuestions: z.array(z.string()),
  needsHumanReview: z.boolean(),
  /** Optional so stored analyses from before this field still parse. */
  meta: AnalysisMeta.optional(),
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;

export const InputLanguage = z.enum(["uz-latn", "uz-cyrl", "ru", "mixed"]);
export type InputLanguage = z.infer<typeof InputLanguage>;

export const AnalyzeInput = z.object({
  text: z.string().min(1),
  language: InputLanguage.optional(),
});
export type AnalyzeInput = z.infer<typeof AnalyzeInput>;

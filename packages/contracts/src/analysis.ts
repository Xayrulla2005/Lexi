import { z } from "zod";
import { Classification } from "./classification";
import { IsoDateTime, Slug, VerificationStatus } from "./common";

export const ANALYSIS_SCHEMA_VERSION = "1.0" as const;

export const RiskLevel = z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const RiskAssessment = z.object({
  level: RiskLevel,
  /** Human-readable signals that led to the level (e.g. matched keywords). */
  signals: z.array(z.string()),
  /** True when the person may be in immediate danger. Forces emergency routing. */
  requiresImmediateAction: z.boolean(),
});
export type RiskAssessment = z.infer<typeof RiskAssessment>;

export const LegalReference = z.object({
  /** Id of the source document in legal-knowledge/ — required for traceability. */
  documentId: Slug,
  documentName: z.string().min(1),
  article: z.string().min(1),
  sourceUrl: z.string().url(),
  verificationStatus: VerificationStatus,
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
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;

export const InputLanguage = z.enum(["uz-latn", "uz-cyrl", "ru", "mixed"]);
export type InputLanguage = z.infer<typeof InputLanguage>;

export const AnalyzeInput = z.object({
  text: z.string().min(1),
  language: InputLanguage.optional(),
});
export type AnalyzeInput = z.infer<typeof AnalyzeInput>;

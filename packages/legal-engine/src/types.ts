import type {
  AnalysisResult,
  LegalDomain,
  RouteStep,
  RouteType,
  RoutingDecision,
  Subcase,
  VerificationStatus,
} from "@lex/contracts";

/**
 * Verification metadata required on every rule and route.
 * Anything that is not VERIFIED forces `requiresHumanReview: true`.
 */
export interface VerificationMetadata {
  status: VerificationStatus;
  /** ISO timestamp of the last legal review; null if never reviewed. */
  lastVerifiedAt: string | null;
  /** Legal reviewer name/handle; null if never reviewed. */
  reviewer: string | null;
  /** documentIds from legal-knowledge/ that justify this rule/route. */
  sourceDocumentIds: readonly string[];
  /** Free-text note, e.g. why something is still pending. */
  note?: string;
}

/** A named, versioned sequence of steps the user should take. */
export interface LegalRoute {
  id: string;
  version: number;
  domain: LegalDomain;
  subcase: Subcase | null;
  /** Primary agency id (data/raw/agencies.csv), or null. */
  agencyId: string | null;
  steps: readonly RouteStep[];
  verification: VerificationMetadata;
}

/** Everything the engine is allowed to look at. No free text, no LLM calls. */
export interface RoutingContext {
  analysis: AnalysisResult;
}

/**
 * A deterministic predicate that selects a route.
 * `matches` must be a pure function of the context (no I/O, no randomness, no clock).
 */
export interface LegalRule {
  id: string;
  description: string;
  /** Lower number = evaluated first. Ties are broken by rule id for determinism. */
  priority: number;
  routeId: string;
  matches(context: RoutingContext): boolean;
  verification: VerificationMetadata;
}

export interface RoutingResult {
  decision: RoutingDecision;
  /** Rule that produced the decision; null for built-in emergency/fallback. */
  matchedRuleId: string | null;
  /** Ordered, human-readable explanation of how the decision was reached (for audit logs). */
  trace: readonly string[];
}

export interface LegalRoutingEngine {
  route(context: RoutingContext): RoutingResult;
}

export type { RouteStep, RouteType, RoutingDecision };

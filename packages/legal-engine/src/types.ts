import type {
  AgencyContact,
  AnalysisResult,
  LegalDomain,
  LegalReference,
  ProblemId,
  ReviewStatus,
  RiskLevel,
  RouteStep,
  RouteType,
  RoutingDecision,
} from "@lex/contracts";

/**
 * A route the user should follow, built from legal-knowledge/catalog/problems.json.
 * Catalog routes have id P01–P65; the built-in ones are EMERGENCY and FALLBACK.
 * Every text field is copied from the catalog — nothing here is generated.
 */
export interface LegalRoute {
  id: string;
  /** Catalog version (`versiya`) the route was built from. */
  catalogVersion: string;
  /** Catalog problem type; null for EMERGENCY/FALLBACK. */
  problemId: ProblemId | null;
  /** Problem title (`nom`); null for EMERGENCY/FALLBACK. */
  title: string | null;
  /** Catalog domain (`soha`); null for EMERGENCY/FALLBACK, which serve every domain. */
  domain: LegalDomain | null;
  /** Catalog risk level (`xavf`); null for EMERGENCY/FALLBACK. */
  riskLevel: RiskLevel | null;
  /** First step text (`birinchi_qadam`); null for EMERGENCY/FALLBACK. */
  firstStep: string | null;
  /** Primary agency: first of `agencies` that is not the other party; null when none. */
  agencyId: string | null;
  /** `organlar`, resolved against the agency catalog, in catalog order. */
  agencies: readonly AgencyContact[];
  /** `eskalatsiya`, resolved against the agency catalog. */
  escalation: readonly AgencyContact[];
  /** `hali_erta`: agencies that are too early to contact at this stage. */
  notYet: readonly AgencyContact[];
  steps: readonly RouteStep[];
  /** `qonunlar` as catalog citations (status DRAFT). */
  legalReferences: readonly LegalReference[];
  /** Application template id (`shablon_id`); null when none. */
  templateId: string | null;
  /** Reviewer notes (`tekshir`): what the legal reviewer still has to check. */
  reviewNotes: readonly string[];
  /** From legal-knowledge/catalog/review-status.json. */
  reviewStatus: ReviewStatus;
}

/** Everything loaded from the catalog: 65 problem routes plus the two built-in routes. */
export interface LegalCatalog {
  version: string;
  /** Catalog routes P01–P65 (EMERGENCY and FALLBACK are not included). */
  routes: readonly LegalRoute[];
  /** Every agency of the catalog (`idoralar`), in catalog order. */
  agencies: readonly AgencyContact[];
  emergency: LegalRoute;
  fallback: LegalRoute;
}

/** Everything the engine is allowed to look at. No free text, no LLM calls. */
export interface RoutingContext {
  analysis: AnalysisResult;
}

export interface RoutingResult {
  decision: RoutingDecision;
  /** Same as decision.reviewStatus; exposed for logs and callers that do not read the decision. */
  reviewStatus: ReviewStatus;
  /** Same as decision.reviewNotice. */
  reviewNotice: string | null;
  /** Ordered, human-readable explanation of how the decision was reached (for audit logs). */
  trace: readonly string[];
}

export interface LegalRoutingEngine {
  route(context: RoutingContext): RoutingResult;
}

export type { RouteStep, RouteType, RoutingDecision };

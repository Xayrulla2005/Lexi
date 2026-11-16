import type { ReviewStatus, RoutingDecision } from "@lex/contracts";
import type { LegalCatalog, LegalRoute, LegalRoutingEngine, RoutingContext, RoutingResult } from "./types";

/** Below this classification confidence the decision always needs human review. */
export const MIN_CONFIDENCE = 0.6;

/** User-facing review warnings (Uzbek, latin). VERIFIED routes show no warning. */
export const REVIEW_NOTICES: Readonly<Record<ReviewStatus, string | null>> = {
  DRAFT: "Bu yo'l hali yurist tomonidan tekshirilmagan",
  VERIFIED_PENDING: "Bu yo'l yurist tekshiruvida, hali tasdiqlanmagan",
  VERIFIED: null,
};

/**
 * Deterministic catalog router.
 *
 * Order of evaluation:
 *   1. risk red (or requiresImmediateAction) -> EMERGENCY route;
 *   2. classification.problemId -> catalog route with the same id;
 *   3. otherwise -> FALLBACK route (free legal advice).
 *
 * The same context always yields the same result. No LLM, network, clock or randomness.
 */
export class DeterministicRoutingEngine implements LegalRoutingEngine {
  private readonly routes: ReadonlyMap<string, LegalRoute>;
  private readonly emergency: LegalRoute;
  private readonly fallback: LegalRoute;

  constructor(catalog: LegalCatalog) {
    this.routes = new Map(catalog.routes.map((r) => [r.id, r]));
    this.emergency = catalog.emergency;
    this.fallback = catalog.fallback;
  }

  route(context: RoutingContext): RoutingResult {
    const { analysis } = context;
    const trace: string[] = [];

    if (analysis.risk.level === "red" || analysis.risk.requiresImmediateAction) {
      trace.push(`emergency override: risk=${analysis.risk.level}, immediate=${analysis.risk.requiresImmediateAction}`);
      return this.result("EMERGENCY", this.emergency, context, trace);
    }

    const { problemId } = analysis.classification;
    const route = problemId === null ? undefined : this.routes.get(problemId);
    if (route) {
      trace.push(`problemId ${problemId} -> route ${route.id} (catalog ${route.catalogVersion}, ${route.reviewStatus})`);
      return this.result("RULE_BASED", route, context, trace);
    }

    trace.push(problemId === null ? "problemId null -> fallback" : `no route for ${problemId} -> fallback`);
    return this.result("FALLBACK", this.fallback, context, trace);
  }

  private result(
    routeType: RoutingDecision["routeType"],
    route: LegalRoute,
    { analysis }: RoutingContext,
    trace: string[],
  ): RoutingResult {
    const reasons: string[] = [];
    if (route.reviewStatus !== "VERIFIED") reasons.push(`route ${route.reviewStatus}`);
    if (analysis.needsHumanReview) reasons.push("analysis.needsHumanReview");
    if (analysis.classification.confidence < MIN_CONFIDENCE) reasons.push(`confidence < ${MIN_CONFIDENCE}`);
    if (routeType === "FALLBACK") reasons.push("fallback");
    if (reasons.length) trace.push(`human review required: ${reasons.join(", ")}`);

    const reviewNotice = REVIEW_NOTICES[route.reviewStatus];
    const decision: RoutingDecision = {
      routeType,
      routeId: routeType === "FALLBACK" ? null : route.id,
      problemId: route.problemId,
      title: route.title,
      agencyId: route.agencyId,
      steps: route.steps.map((s) => ({ ...s })),
      agencies: route.agencies.map((a) => ({ ...a })),
      escalation: route.escalation.map((a) => ({ ...a })),
      legalReferences: route.legalReferences.map((r) => ({ ...r })),
      templateId: route.templateId,
      reviewStatus: route.reviewStatus,
      reviewNotice,
      requiresHumanReview: reasons.length > 0,
    };
    return { decision, reviewStatus: route.reviewStatus, reviewNotice, trace };
  }
}

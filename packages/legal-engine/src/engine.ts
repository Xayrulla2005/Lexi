import type { RoutingDecision } from "@lex/contracts";
import { EMERGENCY_ROUTE, FALLBACK_ROUTE } from "./routes/placeholders";
import type { LegalRoute, LegalRule, LegalRoutingEngine, RoutingContext, RoutingResult } from "./types";

/** Below this classification confidence the decision always needs human review. */
export const MIN_CONFIDENCE = 0.6;

/**
 * Deterministic first-match rule engine.
 *
 * Order of evaluation:
 *   1. Emergency override (risk red or requiresImmediateAction).
 *   2. Rules sorted by (priority, id); first match wins.
 *   3. Fallback route.
 *
 * The same context always yields the same result. No LLM, network, clock or randomness.
 */
export class DeterministicRoutingEngine implements LegalRoutingEngine {
  private readonly rules: readonly LegalRule[];
  private readonly routes: ReadonlyMap<string, LegalRoute>;

  constructor(rules: readonly LegalRule[], routes: readonly LegalRoute[]) {
    this.routes = new Map(routes.map((r) => [r.id, r]));
    for (const rule of rules) {
      if (!this.routes.has(rule.routeId)) {
        throw new Error(`Rule ${rule.id} references unknown route ${rule.routeId}`);
      }
    }
    this.rules = [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  }

  route(context: RoutingContext): RoutingResult {
    const { analysis } = context;
    const trace: string[] = [];

    if (analysis.risk.level === "red" || analysis.risk.requiresImmediateAction) {
      trace.push(`emergency override: risk=${analysis.risk.level}, immediate=${analysis.risk.requiresImmediateAction}`);
      return { decision: this.decide("EMERGENCY", EMERGENCY_ROUTE, context, trace), matchedRuleId: null, trace };
    }

    for (const rule of this.rules) {
      if (rule.verification.status === "REJECTED") {
        trace.push(`skip ${rule.id}: REJECTED`);
        continue;
      }
      if (rule.matches(context)) {
        const route = this.routes.get(rule.routeId) as LegalRoute;
        trace.push(`matched ${rule.id} -> ${route.id}@v${route.version} (${route.verification.status})`);
        return { decision: this.decide("RULE_BASED", route, context, trace, rule), matchedRuleId: rule.id, trace };
      }
    }

    trace.push("no rule matched -> fallback");
    return { decision: this.decide("FALLBACK", FALLBACK_ROUTE, context, trace), matchedRuleId: null, trace };
  }

  private decide(
    routeType: RoutingDecision["routeType"],
    route: LegalRoute,
    { analysis }: RoutingContext,
    trace: string[],
    rule?: LegalRule,
  ): RoutingDecision {
    const reasons: string[] = [];
    if (route.verification.status !== "VERIFIED") reasons.push(`route ${route.verification.status}`);
    if (rule && rule.verification.status !== "VERIFIED") reasons.push(`rule ${rule.verification.status}`);
    if (analysis.needsHumanReview) reasons.push("analysis.needsHumanReview");
    if (analysis.classification.confidence < MIN_CONFIDENCE) reasons.push(`confidence < ${MIN_CONFIDENCE}`);
    if (routeType === "FALLBACK") reasons.push("fallback");
    if (reasons.length) trace.push(`human review required: ${reasons.join(", ")}`);

    return {
      routeType,
      routeId: routeType === "FALLBACK" ? null : route.id,
      agencyId: route.agencyId,
      steps: route.steps.map((s) => ({ ...s })),
      requiresHumanReview: reasons.length > 0,
    };
  }
}

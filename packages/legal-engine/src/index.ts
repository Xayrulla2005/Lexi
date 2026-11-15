/**
 * @lex/legal-engine — deterministic legal routing.
 *
 * The AI produces an AnalysisResult; this package alone turns it into a
 * RoutingDecision. It must never call an LLM or any network service.
 */
import { DeterministicRoutingEngine } from "./engine";
import { PLACEHOLDER_ROUTES, PLACEHOLDER_RULES, EMERGENCY_ROUTE, FALLBACK_ROUTE } from "./routes/placeholders";

export * from "./types";
export { DeterministicRoutingEngine, MIN_CONFIDENCE } from "./engine";
export { PLACEHOLDER_ROUTES, PLACEHOLDER_RULES, EMERGENCY_ROUTE, FALLBACK_ROUTE };

/** Engine wired with the current (placeholder, PENDING) rule set. */
export function createDefaultRoutingEngine(): DeterministicRoutingEngine {
  return new DeterministicRoutingEngine(PLACEHOLDER_RULES, PLACEHOLDER_ROUTES);
}

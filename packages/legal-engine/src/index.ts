/**
 * @lex/legal-engine — deterministic legal routing.
 *
 * The AI produces an AnalysisResult; this package alone turns it into a
 * RoutingDecision, using routes loaded from legal-knowledge/catalog/.
 * It must never call an LLM or any network service.
 */
import { loadCatalog } from "./catalog";
import { DeterministicRoutingEngine } from "./engine";

export * from "./types";
export { DeterministicRoutingEngine, MIN_CONFIDENCE, REVIEW_NOTICES } from "./engine";
export {
  buildCatalog,
  CatalogError,
  DEFAULT_CATALOG_PATH,
  EMERGENCY_AGENCY_IDS,
  EMERGENCY_SAFETY_TEXT,
  FALLBACK_AGENCY_ID,
  loadCatalog,
  NO_ANSWER_PREFIX,
  OTHER_PARTY_ID,
  REVIEW_STATUS_FILE,
} from "./catalog";

/** Engine wired with the repository catalog (legal-knowledge/catalog/problems.json). */
export function createDefaultRoutingEngine(catalogPath?: string): DeterministicRoutingEngine {
  return new DeterministicRoutingEngine(loadCatalog(catalogPath));
}

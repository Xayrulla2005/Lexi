import { Injectable, Logger } from "@nestjs/common";
import type { AgencyContact, AnalysisResult, RoutingDecision } from "@lex/contracts";
import { DeterministicRoutingEngine, loadCatalog, OTHER_PARTY_ID, type LegalCatalog } from "@lex/legal-engine";

/**
 * The only place in the API where a RoutingDecision is produced.
 * Delegates to the deterministic engine in @lex/legal-engine — never to the AI.
 */
@Injectable()
export class LegalRoutingService {
  private readonly logger = new Logger(LegalRoutingService.name);
  private readonly catalog: LegalCatalog = loadCatalog();
  private readonly engine = new DeterministicRoutingEngine(this.catalog);

  decide(analysis: AnalysisResult): RoutingDecision {
    const { decision, trace } = this.engine.route({ analysis });
    this.logger.debug(trace.join(" | "));
    return decision;
  }

  /** Catalog problem title (`nom`), or null. */
  problemTitle(problemId: string): string | null {
    return this.catalog.routes.find((r) => r.problemId === problemId)?.title ?? null;
  }

  /** Catalog agency contact by id, or null. */
  agency(id: string): AgencyContact | null {
    return this.agencies().find((a) => a.id === id) ?? (id === OTHER_PARTY_ID ? this.otherParty() : null);
  }

  private otherParty(): AgencyContact | null {
    for (const r of this.catalog.routes) {
      const a = r.agencies.find((x) => x.id === OTHER_PARTY_ID);
      if (a) return a;
    }
    return null;
  }

  /** Re-routes with a problem type confirmed by the user (deterministic engine, no LLM). */
  decideFor(analysis: AnalysisResult, problemId: string): RoutingDecision {
    const route = this.catalog.routes.find((r) => r.problemId === problemId);
    if (!route) return this.decide(analysis);
    return this.decide({
      ...analysis,
      classification: { domain: route.domain ?? analysis.classification.domain, problemId: route.problemId, confidence: 0.9 },
    });
  }

  /** All catalog agencies except the other party, sorted by name (for the agency cabinet simulator). */
  agencies(): AgencyContact[] {
    return this.catalog.agencies.filter((a) => a.id !== OTHER_PARTY_ID).sort((a, b) => a.name.localeCompare(b.name));
  }
}

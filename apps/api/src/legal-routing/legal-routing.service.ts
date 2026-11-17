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

  /** All catalog agencies except the other party, sorted by name (for the agency cabinet simulator). */
  agencies(): AgencyContact[] {
    const all = new Map<string, AgencyContact>();
    const routes = [...this.catalog.routes, this.catalog.emergency, this.catalog.fallback];
    for (const r of routes) for (const a of [...r.agencies, ...r.escalation, ...r.notYet]) all.set(a.id, a);
    all.delete(OTHER_PARTY_ID);
    return [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

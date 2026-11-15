import { Injectable, Logger } from "@nestjs/common";
import type { AnalysisResult, RoutingDecision } from "@lex/contracts";
import { createDefaultRoutingEngine, type LegalRoutingEngine } from "@lex/legal-engine";

/**
 * The only place in the API where a RoutingDecision is produced.
 * Delegates to the deterministic engine in @lex/legal-engine — never to the AI.
 */
@Injectable()
export class LegalRoutingService {
  private readonly logger = new Logger(LegalRoutingService.name);
  private readonly engine: LegalRoutingEngine = createDefaultRoutingEngine();

  decide(analysis: AnalysisResult): RoutingDecision {
    const { decision, trace } = this.engine.route({ analysis });
    this.logger.debug(trace.join(" | "));
    return decision;
  }
}

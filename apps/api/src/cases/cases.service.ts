import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Case, CaseChannel, CaseMessage, CaseStatus } from "@lex/contracts";
import { AiAnalysisService } from "../ai-analysis/ai-analysis.service";
import { LegalRoutingService } from "../legal-routing/legal-routing.service";

/**
 * Case lifecycle: create -> add messages -> analyze (AI) -> route (engine).
 * Storage is in-memory for now. TODO(Xayrulla): persist via TypeORM (database/entities/case.entity.ts).
 *
 * Constructor params use explicit @Inject: the tsx/esbuild dev runner does not emit decorator metadata.
 */
@Injectable()
export class CasesService {
  private readonly cases = new Map<string, Case>();

  constructor(
    @Inject(AiAnalysisService) private readonly ai: AiAnalysisService,
    @Inject(LegalRoutingService) private readonly routing: LegalRoutingService,
  ) {}

  create(channel: CaseChannel, userId: string | null): Case {
    const now = new Date().toISOString();
    const c: Case = {
      id: randomUUID(),
      userId,
      channel,
      status: "OPEN",
      messages: [],
      analysis: null,
      routingDecision: null,
      createdAt: now,
      updatedAt: now,
    };
    this.cases.set(c.id, c);
    return c;
  }

  get(id: string): Case {
    const c = this.cases.get(id);
    if (!c) throw new NotFoundException("Case not found");
    return c;
  }

  addMessage(id: string, text: string): CaseMessage {
    const c = this.get(id);
    const msg: CaseMessage = { id: randomUUID(), role: "user", text, createdAt: new Date().toISOString() };
    c.messages.push(msg);
    this.touch(c);
    return msg;
  }

  async analyze(id: string): Promise<Case> {
    const c = this.get(id);
    const story = c.messages
      .filter((m) => m.role === "user")
      .map((m) => m.text)
      .join("\n");
    if (!story.trim()) throw new BadRequestException("Case has no user messages to analyze");

    c.analysis = await this.ai.analyze(story);
    c.routingDecision = this.routing.decide(c.analysis);
    c.status = "ANALYZED";
    this.touch(c);
    return c;
  }

  setStatus(id: string, status: CaseStatus): void {
    const c = this.get(id);
    c.status = status;
    this.touch(c);
  }

  private touch(c: Case): void {
    c.updatedAt = new Date().toISOString();
  }
}

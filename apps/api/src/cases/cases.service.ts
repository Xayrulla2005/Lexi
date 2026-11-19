import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Case, type CaseChannel, type CaseMessage, type CaseStatus } from "@lex/contracts";
import { JsonStore } from "../common/json-store";
import { runtimeFile } from "../common/paths";
import { AiAnalysisService } from "../ai-analysis/ai-analysis.service";
import { LegalAnalysisService } from "../legal-knowledge/legal-analysis.service";
import { LegalRoutingService } from "../legal-routing/legal-routing.service";

/**
 * Case lifecycle: create -> add messages -> analyze (AI) -> route (engine).
 * Storage: in-memory + data/runtime/cases.json (survives restarts). TODO(Xayrulla): TypeORM (database/entities/case.entity.ts).
 *
 * Constructor params use explicit @Inject: the tsx/esbuild dev runner does not emit decorator metadata.
 */
@Injectable()
export class CasesService {
  private readonly cases = new JsonStore<Case>(runtimeFile("cases.json"), Case);

  constructor(
    @Inject(AiAnalysisService) private readonly ai: AiAnalysisService,
    @Inject(LegalRoutingService) private readonly routing: LegalRoutingService,
    /** Optional so unit tests can build the service without the LLM/RAG stack. */
    @Optional() @Inject(LegalAnalysisService) private readonly legal: LegalAnalysisService | null = null,
  ) {}

  /** The user's own messages joined (the story told so far). */
  story(id: string): string {
    return this.get(id)
      .messages.filter((m) => m.role === "user")
      .map((m) => m.text)
      .join("\n");
  }

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
      legalAnalysis: null,
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
    this.save(c);
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
    c.legalAnalysis = this.legal ? await this.legal.analyze(story, c.routingDecision) : null;
    c.status = "ANALYZED";
    this.save(c);
    return c;
  }

  /** Waits until all case changes are on disk (bounded by the operation timeout). */
  persist(operation = "cases.persist"): Promise<void> {
    return this.cases.persist(operation);
  }

  setStatus(id: string, status: CaseStatus): void {
    const c = this.get(id);
    c.status = status;
    this.save(c);
  }

  private save(c: Case): void {
    c.updatedAt = new Date().toISOString();
    this.cases.set(c.id, c);
  }
}

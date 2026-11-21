import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ProblemId } from "@lex/contracts";
import { CitizenAuthGuard } from "../auth/citizen-auth.guard";
import { RateLimit } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LegalRetrievalService, type RetrievalResult } from "./legal-retrieval.service";

const RetrieveRequest = z.object({
  story: z.string().trim().min(1).max(5000),
  problemId: ProblemId.nullable(),
});
type RetrieveRequest = z.infer<typeof RetrieveRequest>;

/**
 * Articles for a story: catalog articles of the problem (source "catalog") + RAG extras (source "rag").
 * Runs the embedding model, so: authenticated citizens only, AI rate limits. (Web and bot do not call it.)
 */
@Controller("legal-knowledge")
@UseGuards(CitizenAuthGuard)
export class LegalKnowledgeController {
  constructor(@Inject(LegalRetrievalService) private readonly retrieval: LegalRetrievalService) {}

  @Post("retrieve")
  @HttpCode(200)
  @RateLimit("ai")
  retrieve(@Body(new ZodValidationPipe(RetrieveRequest)) body: RetrieveRequest): Promise<RetrievalResult> {
    return this.retrieval.retrieve(body.story, body.problemId);
  }
}

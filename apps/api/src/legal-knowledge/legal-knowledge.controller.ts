import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { ProblemId } from "@lex/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LegalRetrievalService, type RetrievalResult } from "./legal-retrieval.service";

const RetrieveRequest = z.object({
  story: z.string().trim().min(1).max(5000),
  problemId: ProblemId.nullable(),
});
type RetrieveRequest = z.infer<typeof RetrieveRequest>;

/** Articles for a story: catalog articles of the problem (source "catalog") + RAG extras (source "rag"). */
@Controller("legal-knowledge")
export class LegalKnowledgeController {
  constructor(@Inject(LegalRetrievalService) private readonly retrieval: LegalRetrievalService) {}

  @Post("retrieve")
  @HttpCode(200)
  retrieve(@Body(new ZodValidationPipe(RetrieveRequest)) body: RetrieveRequest): Promise<RetrievalResult> {
    return this.retrieval.retrieve(body.story, body.problemId);
  }
}

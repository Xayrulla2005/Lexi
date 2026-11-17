import { Module } from "@nestjs/common";
import { LegalKnowledgeController } from "./legal-knowledge.controller";
import { LegalKnowledgeService } from "./legal-knowledge.service";
import { LegalRetrievalService } from "./legal-retrieval.service";

/** Versioned, traceable legal sources used for retrieval and citations. */
@Module({
  controllers: [LegalKnowledgeController],
  providers: [LegalKnowledgeService, LegalRetrievalService],
  exports: [LegalKnowledgeService, LegalRetrievalService],
})
export class LegalKnowledgeModule {}

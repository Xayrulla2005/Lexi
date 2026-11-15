import { Module } from "@nestjs/common";
import { LegalKnowledgeService } from "./legal-knowledge.service";

/** Versioned, traceable legal sources used for retrieval and citations. */
@Module({ providers: [LegalKnowledgeService], exports: [LegalKnowledgeService] })
export class LegalKnowledgeModule {}

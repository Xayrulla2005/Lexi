import { Module } from "@nestjs/common";
import { AiAnalysisModule } from "../ai-analysis/ai-analysis.module";
import { LegalKnowledgeModule } from "../legal-knowledge/legal-knowledge.module";
import { LegalRoutingModule } from "../legal-routing/legal-routing.module";
import { CasesController } from "./cases.controller";
import { CasesService } from "./cases.service";

/** Case lifecycle and orchestration of analysis + routing. */
@Module({
  imports: [AiAnalysisModule, LegalRoutingModule, LegalKnowledgeModule],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}

import { Module } from "@nestjs/common";
import { ActionPlansModule } from "./action-plans/action-plans.module";
import { AgencyGatewayModule } from "./agency-gateway/agency-gateway.module";
import { AiAnalysisModule } from "./ai-analysis/ai-analysis.module";
import { CaseTrackingModule } from "./case-tracking/case-tracking.module";
import { CasesModule } from "./cases/cases.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { LegalKnowledgeModule } from "./legal-knowledge/legal-knowledge.module";
import { LegalRoutingModule } from "./legal-routing/legal-routing.module";

@Module({
  imports: [
    DatabaseModule.forRoot(),
    HealthModule,
    CasesModule,
    AiAnalysisModule,
    LegalKnowledgeModule,
    LegalRoutingModule,
    ActionPlansModule,
    AgencyGatewayModule,
    CaseTrackingModule,
  ],
})
export class AppModule {}

import { Module } from "@nestjs/common";
import { ActionPlansModule } from "./action-plans/action-plans.module";
import { AgencyGatewayModule } from "./agency-gateway/agency-gateway.module";
import { AiAnalysisModule } from "./ai-analysis/ai-analysis.module";
import { ApplicationsModule } from "./applications/applications.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CaseTrackingModule } from "./case-tracking/case-tracking.module";
import { CasesModule } from "./cases/cases.module";
import { RateLimitModule } from "./common/rate-limit";
import { ConversationsModule } from "./conversations/conversations.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { LegalKnowledgeModule } from "./legal-knowledge/legal-knowledge.module";
import { LegalRoutingModule } from "./legal-routing/legal-routing.module";
import { LlmModule } from "./llm/llm.module";
import { MarketplaceModule } from "./marketplace/marketplace.module";
import { SimModule } from "./sim/sim.module";

@Module({
  imports: [
    RateLimitModule,
    LlmModule,
    AuthModule,
    AuditModule,
    DatabaseModule.forRoot(),
    HealthModule,
    CasesModule,
    AiAnalysisModule,
    LegalKnowledgeModule,
    LegalRoutingModule,
    ActionPlansModule,
    AgencyGatewayModule,
    CaseTrackingModule,
    SimModule,
    ApplicationsModule,
    ConversationsModule,
    MarketplaceModule,
  ],
})
export class AppModule {}

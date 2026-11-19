import { Module } from "@nestjs/common";
import { AgencyGatewayModule } from "../agency-gateway/agency-gateway.module";
import { ApplicationsModule } from "../applications/applications.module";
import { CasesModule } from "../cases/cases.module";
import { LegalRoutingModule } from "../legal-routing/legal-routing.module";
import { SimModule } from "../sim/sim.module";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";

/** Lexi — the legal dispatcher conversation (triage -> details -> explain -> roadmap -> action -> tracking). */
@Module({
  imports: [CasesModule, LegalRoutingModule, ApplicationsModule, AgencyGatewayModule, SimModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}

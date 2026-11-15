import { Module } from "@nestjs/common";
import { CasesModule } from "../cases/cases.module";
import { AGENCY_GATEWAY } from "./agency-gateway";
import { MockAgencyAdapter } from "./mock-agency.adapter";
import { SimulatorController } from "./simulator.controller";
import { SubmissionsController } from "./submissions.controller";

/**
 * Consent-gated submission to agencies. Hackathon build uses the simulator only;
 * an official integration would replace `useClass` here and nothing else.
 */
@Module({
  imports: [CasesModule],
  controllers: [SubmissionsController, SimulatorController],
  providers: [{ provide: AGENCY_GATEWAY, useClass: MockAgencyAdapter }],
  exports: [AGENCY_GATEWAY],
})
export class AgencyGatewayModule {}

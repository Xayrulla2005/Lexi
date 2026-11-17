import { Module } from "@nestjs/common";
import { ApplicationsModule } from "../applications/applications.module";
import { CasesModule } from "../cases/cases.module";
import { LegalRoutingModule } from "../legal-routing/legal-routing.module";
import { SimModule } from "../sim/sim.module";
import { AgencyCabinetController } from "./agency-cabinet.controller";
import { AGENCY_GATEWAY } from "./agency-gateway";
import { MockAgencyAdapter } from "./mock-agency.adapter";
import { SimulatorController } from "./simulator.controller";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";

/**
 * Consent-gated submission to agencies. Hackathon build uses the simulator only;
 * a RealAgencyAdapter would replace `useExisting` here (and the cabinet controller
 * would be removed) — the citizen-side flow stays the same.
 */
@Module({
  imports: [CasesModule, ApplicationsModule, SimModule, LegalRoutingModule],
  controllers: [SubmissionsController, SimulatorController, AgencyCabinetController],
  providers: [MockAgencyAdapter, { provide: AGENCY_GATEWAY, useExisting: MockAgencyAdapter }, SubmissionsService],
  exports: [AGENCY_GATEWAY, SubmissionsService],
})
export class AgencyGatewayModule {}

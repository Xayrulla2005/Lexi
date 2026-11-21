import { Module } from "@nestjs/common";
import { ApplicationsModule } from "../applications/applications.module";
import { simModeEnabled } from "../auth/sim-mode";
import { CasesModule } from "../cases/cases.module";
import { LegalRoutingModule } from "../legal-routing/legal-routing.module";
import { SimModule } from "../sim/sim.module";
import { AgencyCabinetController } from "./agency-cabinet.controller";
import { AGENCY_GATEWAY, type AgencyGateway } from "./agency-gateway";
import { DisabledAgencyGateway } from "./disabled-agency.gateway";
import { EmergencyCallsService } from "./emergency-calls.service";
import { MockAgencyAdapter } from "./mock-agency.adapter";
import { AgencyOfficerGuard, SimAgencySessionsService } from "./sim-agency-sessions.service";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";

/**
 * Consent-gated submission to agencies. There is NO official government connector:
 * - SIM_MODE=true  -> MockAgencyAdapter (simulator) + the simulator cabinet (/sim/idora);
 * - otherwise      -> DisabledAgencyGateway: submissions are refused (503), the cabinet is 404.
 * A RealAgencyAdapter would be returned by the factory below; the citizen-side flow stays the same.
 */
@Module({
  imports: [CasesModule, ApplicationsModule, SimModule, LegalRoutingModule],
  controllers: [SubmissionsController, AgencyCabinetController],
  providers: [
    MockAgencyAdapter,
    {
      provide: AGENCY_GATEWAY,
      inject: [MockAgencyAdapter],
      useFactory: (mock: MockAgencyAdapter): AgencyGateway => (simModeEnabled() ? mock : new DisabledAgencyGateway()),
    },
    SubmissionsService,
    EmergencyCallsService,
    SimAgencySessionsService,
    AgencyOfficerGuard,
  ],
  exports: [AGENCY_GATEWAY, SubmissionsService, EmergencyCallsService, MockAgencyAdapter],
})
export class AgencyGatewayModule {}

import { Controller, Get, Inject, Param } from "@nestjs/common";
import type { AgencySubmission } from "@lex/contracts";
import { AGENCY_GATEWAY, type AgencyGateway } from "./agency-gateway";

/** Agency-side view for the demo simulator panel (apps/web /simulator). */
@Controller("simulator")
export class SimulatorController {
  constructor(@Inject(AGENCY_GATEWAY) private readonly gateway: AgencyGateway) {}

  @Get(":agencyId/submissions")
  list(@Param("agencyId") agencyId: string): Promise<AgencySubmission[]> {
    return this.gateway.listByAgency(agencyId);
  }
}

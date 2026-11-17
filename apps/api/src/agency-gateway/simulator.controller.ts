import { Controller, Get, Inject, Param } from "@nestjs/common";
import type { AgencySubmission } from "@lex/contracts";
import { AGENCY_GATEWAY, type AgencyGateway } from "./agency-gateway";

/** Legacy agency-side list for the old /simulator page; the cabinet uses /sim/idora. */
@Controller("simulator")
export class SimulatorController {
  constructor(@Inject(AGENCY_GATEWAY) private readonly gateway: AgencyGateway) {}

  @Get(":agencyId/submissions")
  list(@Param("agencyId") agencyId: string): Promise<AgencySubmission[]> {
    return this.gateway.listInbox(agencyId);
  }
}

import { Controller, Get, Inject, Param } from "@nestjs/common";
import { AGENCY_GATEWAY, type AgencyGateway } from "./agency-gateway";

@Controller("simulator")
export class SimulatorController {
  constructor(@Inject(AGENCY_GATEWAY) private readonly gateway: AgencyGateway) {}

  @Get(":agency/appeals")
  list(@Param("agency") agency: string) {
    return this.gateway.listByAgency(agency);
  }
}

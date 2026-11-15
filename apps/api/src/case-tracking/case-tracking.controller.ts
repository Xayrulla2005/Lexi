import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe } from "@nestjs/common";
import type { AgencySubmission } from "@lex/contracts";
import { AGENCY_GATEWAY, type AgencyGateway } from "../agency-gateway/agency-gateway";

/**
 * Status tracking for submitted cases.
 * TODO: status history, overdue detection and notifications to bot/web.
 */
@Controller("submissions")
export class CaseTrackingController {
  constructor(@Inject(AGENCY_GATEWAY) private readonly gateway: AgencyGateway) {}

  @Get(":id")
  async status(@Param("id", ParseUUIDPipe) id: string): Promise<AgencySubmission> {
    const submission = await this.gateway.getStatus(id);
    if (!submission) throw new NotFoundException("Submission not found");
    return submission;
  }
}

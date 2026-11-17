import { Controller, Get, Headers, Inject, Param, ParseUUIDPipe } from "@nestjs/common";
import { SIM_SESSION_HEADER, type SubmissionTracking } from "@lex/contracts";
import { SubmissionsService } from "../agency-gateway/submissions.service";
import { OneIdSimulatorService } from "../sim/oneid.service";

/**
 * Status tracking for the citizen's own submissions (web polls this every few seconds).
 * Includes the agency answer and, after OVERDUE, the id of the escalation draft.
 */
@Controller("submissions")
export class CaseTrackingController {
  constructor(
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
    @Inject(OneIdSimulatorService) private readonly oneId: OneIdSimulatorService,
  ) {}

  @Get(":id")
  status(@Param("id", ParseUUIDPipe) id: string, @Headers(SIM_SESSION_HEADER) token?: string): Promise<SubmissionTracking> {
    return this.submissions.tracking(id, this.oneId.session(token).citizen.id);
  }
}

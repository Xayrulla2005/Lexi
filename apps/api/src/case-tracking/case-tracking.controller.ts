import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import type { SubmissionTracking } from "@lex/contracts";
import { SubmissionsService } from "../agency-gateway/submissions.service";
import type { AuthenticatedCitizen } from "../auth/auth-provider";
import { CitizenAuthGuard, CurrentCitizen } from "../auth/citizen-auth.guard";

/**
 * Status tracking for the citizen's own submissions (web polls this every few seconds).
 * Includes the agency answer and, after OVERDUE, the id of the escalation draft.
 */
@Controller("submissions")
@UseGuards(CitizenAuthGuard)
export class CaseTrackingController {
  constructor(
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
  ) {}

  @Get(":id")
  status(@Param("id", ParseUUIDPipe) id: string, @CurrentCitizen() auth: AuthenticatedCitizen): Promise<SubmissionTracking> {
    return this.submissions.tracking(id, auth.principal.id);
  }
}

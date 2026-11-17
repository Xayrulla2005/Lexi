import { Body, Controller, Headers, Inject, Post } from "@nestjs/common";
import { SIM_SESSION_HEADER, SubmitToAgencyRequest, type AgencySubmission } from "@lex/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OneIdSimulatorService } from "../sim/oneid.service";
import { SubmissionsService } from "./submissions.service";

@Controller("submissions")
export class SubmissionsController {
  constructor(
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
    @Inject(OneIdSimulatorService) private readonly oneId: OneIdSimulatorService,
  ) {}

  /**
   * Nothing is submitted without explicit consent (`consent: true` in the body AND a stored
   * consent time on the application), a valid (simulated) signature, and only to the agency
   * the deterministic routing decision names.
   */
  @Post()
  submit(
    @Body(new ZodValidationPipe(SubmitToAgencyRequest)) body: SubmitToAgencyRequest,
    @Headers(SIM_SESSION_HEADER) token?: string,
  ): Promise<AgencySubmission> {
    return this.submissions.submit(body.applicationId, this.oneId.session(token).citizen);
  }
}

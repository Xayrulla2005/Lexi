import { Body, Controller, Headers, Inject, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { IDEMPOTENCY_KEY_HEADER, SubmitToAgencyRequest, type AgencySubmission } from "@lex/contracts";
import { type AuthenticatedCitizen, requireIdentity } from "../auth/auth-provider";
import { CitizenAuthGuard, CurrentCitizen } from "../auth/citizen-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SubmissionsService } from "./submissions.service";

@Controller("submissions")
@UseGuards(CitizenAuthGuard)
export class SubmissionsController {
  constructor(
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
  ) {}

  /**
   * Nothing is submitted without explicit consent (`consent: true` in the body AND a stored
   * consent time on the application), a valid (simulated) signature, and only to the agency
   * the deterministic routing decision names.
   */
  @Post()
  async submit(
    @Body(new ZodValidationPipe(SubmitToAgencyRequest)) body: SubmitToAgencyRequest,
    @CurrentCitizen() auth: AuthenticatedCitizen,
    @Res({ passthrough: true }) res: Response,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey?: string,
  ): Promise<AgencySubmission> {
    const { submission, replayed } = await this.submissions.submit(body.applicationId, auth.principal.id, requireIdentity(auth), idempotencyKey);
    if (replayed) res.setHeader("Idempotent-Replayed", "true");
    return submission;
  }
}

import { BadRequestException, Body, Controller, Inject, Post } from "@nestjs/common";
import { SubmitToAgencyRequest, type AgencySubmission } from "@lex/contracts";
import { CasesService } from "../cases/cases.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AGENCY_GATEWAY, type AgencyGateway } from "./agency-gateway";

@Controller("submissions")
export class SubmissionsController {
  constructor(
    @Inject(AGENCY_GATEWAY) private readonly gateway: AgencyGateway,
    @Inject(CasesService) private readonly cases: CasesService,
  ) {}

  /**
   * Nothing is submitted without explicit user consent (`consent: true`, enforced by the schema),
   * and only to an agency that the deterministic routing decision for this case names.
   */
  @Post()
  async submit(
    @Body(new ZodValidationPipe(SubmitToAgencyRequest)) body: SubmitToAgencyRequest,
  ): Promise<AgencySubmission> {
    const c = this.cases.get(body.caseId);
    const decision = c.routingDecision;
    if (!decision) throw new BadRequestException("Case has not been analyzed and routed yet");

    const allowed = new Set([decision.agencyId, ...decision.steps.map((s) => s.agencyId)].filter(Boolean));
    if (!allowed.has(body.agencyId)) {
      throw new BadRequestException("Agency is not part of this case's routing decision");
    }

    const submission = await this.gateway.submit({
      caseId: body.caseId,
      agencyId: body.agencyId,
      documentId: body.documentId,
    });
    this.cases.setStatus(c.id, "SUBMITTED");
    return submission;
  }
}

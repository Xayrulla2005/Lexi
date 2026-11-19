import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, StreamableFile } from "@nestjs/common";
import {
  AgencyRespondRequest,
  AgencyStatusUpdateRequest,
  type AgencyContact,
  type AgencySubmission,
  type EmergencyCall,
  type InboxItem,
  type SimClock,
} from "@lex/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LegalRoutingService } from "../legal-routing/legal-routing.service";
import { EriSimulatorService } from "../sim/eri.service";
import { EmergencyCallsService } from "./emergency-calls.service";
import { MockAgencyAdapter } from "./mock-agency.adapter";

/**
 * SIMULATOR — agency cabinet (apps/web /idora). Plays the role of the agency:
 * reads the inbox, opens packages, changes status and answers.
 * No authentication: it exists only for the demo and must never face real agencies.
 */
@Controller("sim/idora")
export class AgencyCabinetController {
  constructor(
    @Inject(MockAgencyAdapter) private readonly mock: MockAgencyAdapter,
    @Inject(EriSimulatorService) private readonly eri: EriSimulatorService,
    @Inject(LegalRoutingService) private readonly routing: LegalRoutingService,
    @Inject(EmergencyCallsService) private readonly calls: EmergencyCallsService,
  ) {}

  /** "Navbatchi qism — SIMULYATOR": emergency calls sent from conversations (with consent). */
  @Get(":agencyId/calls")
  emergencyCalls(@Param("agencyId") agencyId: string): EmergencyCall[] {
    return this.calls.list(agencyId);
  }

  /** Catalog agencies (without the "other party"). */
  @Get("agencies")
  agencies(): AgencyContact[] {
    return this.routing.agencies();
  }

  /** Clock mode: MANUAL (default) or AUTO (DEMO_SPEED set). */
  @Get("clock")
  clock(): SimClock {
    return this.mock.clock();
  }

  /** "⏩ Vaqtni oldinga surish (+15 kun)" — SIMULATOR only (this controller exists only with the mock adapter). */
  @Post("submissions/:id/advance")
  advance(@Param("id", ParseUUIDPipe) id: string): Promise<AgencySubmission> {
    return this.mock.advance(id);
  }

  @Get(":agencyId/inbox")
  inbox(@Param("agencyId") agencyId: string): Promise<AgencySubmission[]> {
    return this.mock.listInbox(agencyId);
  }

  @Get("submissions/:id")
  async open(@Param("id", ParseUUIDPipe) id: string): Promise<InboxItem> {
    const submission = await this.mock.getStatus(id);
    const pkg = this.mock.getPackage(id);
    return {
      submission: submission ?? this.never(),
      caseInfo: pkg.caseInfo,
      citizen: pkg.citizen,
      consentAt: pkg.consentAt,
      signature: pkg.signature,
      signatureCheck: await this.eri.verify(Buffer.from(pkg.pdfBase64, "base64"), pkg.signature),
    };
  }

  @Get("submissions/:id/pdf")
  pdf(@Param("id", ParseUUIDPipe) id: string): StreamableFile {
    return new StreamableFile(Buffer.from(this.mock.getPackage(id).pdfBase64, "base64"), {
      type: "application/pdf",
      disposition: 'inline; filename="ariza.pdf"',
    });
  }

  @Post("submissions/:id/status")
  status(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AgencyStatusUpdateRequest)) body: AgencyStatusUpdateRequest,
  ): Promise<AgencySubmission> {
    return this.mock.setAgencyStatus(id, body.status);
  }

  @Post("submissions/:id/respond")
  respond(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AgencyRespondRequest)) body: AgencyRespondRequest,
  ): Promise<AgencySubmission> {
    return this.mock.respond(id, body.text);
  }

  private never(): never {
    throw new Error("unreachable: package exists without a submission");
  }
}

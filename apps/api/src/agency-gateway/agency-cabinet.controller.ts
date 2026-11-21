import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  AgencyRespondRequest,
  AgencyStatusUpdateRequest,
  SimAgencyLoginRequest,
  type AgencyContact,
  type AgencySubmission,
  type EmergencyCall,
  type InboxItem,
  type SimAgencySession,
  type SimClock,
} from "@lex/contracts";
import { SimModeGuard } from "../auth/sim-mode";
import { RateLimit } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LegalRoutingService } from "../legal-routing/legal-routing.service";
import { EriSimulatorService } from "../sim/eri.service";
import { EmergencyCallsService } from "./emergency-calls.service";
import { MockAgencyAdapter } from "./mock-agency.adapter";
import { type AgencyOfficer, AgencyOfficerGuard, CurrentOfficer, SimAgencySessionsService } from "./sim-agency-sessions.service";

/**
 * SIMULATOR — agency cabinet (apps/web /idora). Plays the role of the agency: reads the inbox,
 * opens packages, changes status and answers. Exists only with SIM_MODE=true (404 otherwise).
 * Every route with case or citizen data needs a demo-officer session (x-sim-agency-session)
 * and is limited to that officer's agency (403 for another agency's data).
 * Never facing real agencies: there is no official integration.
 */
@Controller("sim/idora")
@UseGuards(SimModeGuard)
export class AgencyCabinetController {
  constructor(
    @Inject(MockAgencyAdapter) private readonly mock: MockAgencyAdapter,
    @Inject(EriSimulatorService) private readonly eri: EriSimulatorService,
    @Inject(LegalRoutingService) private readonly routing: LegalRoutingService,
    @Inject(EmergencyCallsService) private readonly calls: EmergencyCallsService,
    @Inject(SimAgencySessionsService) private readonly sessions: SimAgencySessionsService,
  ) {}

  /** Catalog agencies for the login picker (public catalog data, no case data). */
  @Get("agencies")
  agencies(): AgencyContact[] {
    return this.routing.agencies();
  }

  /** Clock mode: MANUAL (default) or AUTO (DEMO_SPEED set). No case data. */
  @Get("clock")
  clock(): SimClock {
    return this.mock.clock();
  }

  /** Demo officer login for one agency (passcode only if SIM_AGENCY_PASSCODE is set). */
  @Post("login")
  @RateLimit("auth")
  login(@Body(new ZodValidationPipe(SimAgencyLoginRequest)) body: SimAgencyLoginRequest): Promise<SimAgencySession> {
    return this.sessions.login(body.agencyId, body.passcode);
  }

  /** "Navbatchi qism — SIMULYATOR": emergency calls sent from conversations (with consent). */
  @Get(":agencyId/calls")
  @UseGuards(AgencyOfficerGuard)
  emergencyCalls(@Param("agencyId") agencyId: string, @CurrentOfficer() officer: AgencyOfficer): EmergencyCall[] {
    this.sameAgency(officer, agencyId);
    return this.calls.list(agencyId);
  }

  @Get(":agencyId/inbox")
  @UseGuards(AgencyOfficerGuard)
  inbox(@Param("agencyId") agencyId: string, @CurrentOfficer() officer: AgencyOfficer): Promise<AgencySubmission[]> {
    this.sameAgency(officer, agencyId);
    return this.mock.listInbox(agencyId);
  }

  /** "⏩ Vaqtni oldinga surish (+15 kun)" — SIMULATOR only. */
  @Post("submissions/:id/advance")
  @UseGuards(AgencyOfficerGuard)
  async advance(@Param("id", ParseUUIDPipe) id: string, @CurrentOfficer() officer: AgencyOfficer): Promise<AgencySubmission> {
    await this.ownSubmission(officer, id);
    return this.mock.advance(id);
  }

  @Get("submissions/:id")
  @UseGuards(AgencyOfficerGuard)
  async open(@Param("id", ParseUUIDPipe) id: string, @CurrentOfficer() officer: AgencyOfficer): Promise<InboxItem> {
    const submission = await this.ownSubmission(officer, id);
    const pkg = this.mock.getPackage(id);
    return {
      submission,
      caseInfo: pkg.caseInfo,
      citizen: pkg.citizen,
      consentAt: pkg.consentAt,
      signature: pkg.signature,
      signatureCheck: await this.eri.verify(Buffer.from(pkg.pdfBase64, "base64"), pkg.signature),
    };
  }

  @Get("submissions/:id/pdf")
  @UseGuards(AgencyOfficerGuard)
  async pdf(@Param("id", ParseUUIDPipe) id: string, @CurrentOfficer() officer: AgencyOfficer): Promise<StreamableFile> {
    await this.ownSubmission(officer, id);
    return new StreamableFile(Buffer.from(this.mock.getPackage(id).pdfBase64, "base64"), {
      type: "application/pdf",
      disposition: 'inline; filename="ariza.pdf"',
    });
  }

  @Post("submissions/:id/status")
  @UseGuards(AgencyOfficerGuard)
  async status(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AgencyStatusUpdateRequest)) body: AgencyStatusUpdateRequest,
    @CurrentOfficer() officer: AgencyOfficer,
  ): Promise<AgencySubmission> {
    await this.ownSubmission(officer, id);
    return this.mock.setAgencyStatus(id, body.status);
  }

  @Post("submissions/:id/respond")
  @UseGuards(AgencyOfficerGuard)
  async respond(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AgencyRespondRequest)) body: AgencyRespondRequest,
    @CurrentOfficer() officer: AgencyOfficer,
  ): Promise<AgencySubmission> {
    await this.ownSubmission(officer, id);
    return this.mock.respond(id, body.text);
  }

  private sameAgency(officer: AgencyOfficer, agencyId: string): void {
    if (officer.agencyId !== agencyId) throw new ForbiddenException("Another agency's cabinet");
  }

  /** The submission if it was addressed to the officer's agency; 404 if unknown, 403 if another agency's. */
  private async ownSubmission(officer: AgencyOfficer, id: string): Promise<AgencySubmission> {
    const s = await this.mock.getStatus(id);
    if (!s) throw new ForbiddenException("Another agency's submission");
    this.sameAgency(officer, s.agencyId);
    return s;
  }
}

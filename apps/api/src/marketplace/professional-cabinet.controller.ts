import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  ConsultationDecision,
  SIM_PROFESSIONAL_SESSION_HEADER,
  SimProfessionalLoginRequest,
  type AssignedConsultation,
  type SimProfessionalSession,
} from "@lex/contracts";
import { SimModeGuard } from "../auth/sim-mode";
import { RateLimit } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MarketplaceService } from "./marketplace.service";
import { CurrentProfessional, ProfessionalGuard, type ProfessionalPrincipal, SimProfessionalSessionsService } from "./sim-professional-sessions";

const TARGET = { accept: "ACCEPTED", decline: "DECLINED", complete: "COMPLETED" } as const;

/**
 * SIMULATOR — lawyer cabinet (apps/web /yurist) for the fictional demo professionals.
 * 404 unless SIM_MODE=true. Every consultation route needs a professional session and acts
 * only on consultations assigned to that professional (403 otherwise). The professional id
 * comes from the session, never from the request.
 */
@Controller("sim/professionals")
@UseGuards(SimModeGuard)
export class ProfessionalCabinetController {
  constructor(
    @Inject(MarketplaceService) private readonly market: MarketplaceService,
    @Inject(SimProfessionalSessionsService) private readonly sessions: SimProfessionalSessionsService,
  ) {}

  @Post("login")
  @RateLimit("auth")
  login(@Body(new ZodValidationPipe(SimProfessionalLoginRequest)) body: SimProfessionalLoginRequest): Promise<SimProfessionalSession> {
    return this.sessions.login(body.professionalId, body.passcode);
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Headers(SIM_PROFESSIONAL_SESSION_HEADER) token?: string): Promise<void> {
    return this.sessions.logout(token);
  }

  @Get("consultations")
  @UseGuards(ProfessionalGuard)
  list(@CurrentProfessional() pro: ProfessionalPrincipal): AssignedConsultation[] {
    return this.market.assignedTo(pro.professionalId);
  }

  @Get("consultations/:id")
  @UseGuards(ProfessionalGuard)
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentProfessional() pro: ProfessionalPrincipal): AssignedConsultation {
    return this.market.assigned(id, pro.professionalId);
  }

  /** accept (REQUESTED->ACCEPTED), decline (REQUESTED->DECLINED), complete (ACCEPTED->COMPLETED); else 409. */
  @Post("consultations/:id/decision")
  @HttpCode(200)
  @UseGuards(ProfessionalGuard)
  async decide(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ConsultationDecision)) body: ConsultationDecision,
    @CurrentProfessional() pro: ProfessionalPrincipal,
  ): Promise<AssignedConsultation> {
    this.market.assigned(id, pro.professionalId); // 404 / 403 before any state check
    await this.market.transition(id, TARGET[body.action], { by: "professional", professionalId: pro.professionalId });
    return this.market.assigned(id, pro.professionalId);
  }
}

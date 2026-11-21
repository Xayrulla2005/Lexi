import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UnauthorizedException, UseGuards } from "@nestjs/common";
import {
  CreateConsultationRequest,
  ProfessionalSearchQuery,
  Slug,
  type ConsultationRequest,
  type LegalProfessional,
} from "@lex/contracts";
import type { AuthenticatedCitizen } from "../auth/auth-provider";
import { CitizenAuthGuard, CurrentCitizen, OptionalCitizenAuthGuard } from "../auth/citizen-auth.guard";
import { RateLimit } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MarketplaceService } from "./marketplace.service";

/** Directory of legal professionals (demo directory only in SIM_MODE; see MarketplaceService). */
@Controller("professionals")
@UseGuards(OptionalCitizenAuthGuard)
export class ProfessionalsController {
  constructor(@Inject(MarketplaceService) private readonly market: MarketplaceService) {}

  /** ?domain=&region= ; ?caseId= recommends for the caller's own case (login required). */
  @Get()
  search(
    @Query(new ZodValidationPipe(ProfessionalSearchQuery)) q: ProfessionalSearchQuery,
    @CurrentCitizen() auth: AuthenticatedCitizen | null,
  ): LegalProfessional[] {
    if (q.caseId) {
      if (!auth) throw new UnauthorizedException("Authentication required");
      return this.market.recommendForCase(q.caseId, auth.citizen.id, q.region);
    }
    return this.market.search(q.domain, q.region);
  }

  @Get(":id")
  profile(@Param("id", new ZodValidationPipe(Slug)) id: string): LegalProfessional {
    return this.market.profile(id);
  }
}

/** Consultation requests of the authenticated citizen. */
@Controller("consultations")
@UseGuards(CitizenAuthGuard)
export class ConsultationsController {
  constructor(@Inject(MarketplaceService) private readonly market: MarketplaceService) {}

  /** Body must include `consent: true` (the message is shared with the professional). */
  @Post()
  @RateLimit("create")
  create(
    @Body(new ZodValidationPipe(CreateConsultationRequest)) body: CreateConsultationRequest,
    @CurrentCitizen() auth: AuthenticatedCitizen,
  ): Promise<ConsultationRequest> {
    return this.market.request(auth.citizen.id, body);
  }

  @Get()
  mine(@CurrentCitizen() auth: AuthenticatedCitizen): ConsultationRequest[] {
    return this.market.mine(auth.citizen.id);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentCitizen() auth: AuthenticatedCitizen): ConsultationRequest {
    return this.market.owned(id, auth.citizen.id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Param("id", ParseUUIDPipe) id: string, @CurrentCitizen() auth: AuthenticatedCitizen): Promise<ConsultationRequest> {
    return this.market.transition(id, "CANCELLED", { by: "citizen", citizenId: auth.citizen.id });
  }
}

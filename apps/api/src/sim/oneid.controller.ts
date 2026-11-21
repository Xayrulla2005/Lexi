import { Body, Controller, Get, Headers, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { SIM_SESSION_HEADER, SimLoginRequest, type SimCitizenSummary, type SimSession } from "@lex/contracts";
import { SimModeGuard } from "../auth/sim-mode";
import { RateLimit } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OneIdSimulatorService } from "./oneid.service";

/** SIMULATOR — OneID login with fictional test citizens. 404 unless SIM_MODE=true. */
@Controller("sim/oneid")
@UseGuards(SimModeGuard)
export class OneIdSimulatorController {
  constructor(@Inject(OneIdSimulatorService) private readonly oneId: OneIdSimulatorService) {}

  /** Names only; the full (fictional) record is returned to the citizen after login. */
  @Get("citizens")
  citizens(): SimCitizenSummary[] {
    return this.oneId.listSummaries();
  }

  @Post("login")
  @RateLimit("auth")
  login(
    @Body(new ZodValidationPipe(SimLoginRequest)) body: SimLoginRequest,
    @Headers(SIM_SESSION_HEADER) previous?: string,
  ): Promise<SimSession> {
    // Rotation: a session presented with the login is revoked; a fresh token is issued.
    return this.oneId.login(body.citizenId, previous);
  }

  /** Revokes this session (header token). Idempotent: 204 even if already revoked. */
  @Post("logout")
  @HttpCode(204)
  async logout(@Headers(SIM_SESSION_HEADER) token?: string): Promise<void> {
    if (token) this.oneId.revoke(token);
    await this.oneId.persist("oneid.logout");
  }

  /** Revokes every session of the current citizen (all devices). */
  @Post("logout-all")
  @HttpCode(204)
  async logoutAll(@Headers(SIM_SESSION_HEADER) token?: string): Promise<void> {
    this.oneId.revokeAll(this.oneId.session(token).citizen.id);
    await this.oneId.persist("oneid.logout-all");
  }

  @Get("session")
  session(@Headers(SIM_SESSION_HEADER) token: string | undefined): SimSession {
    return this.oneId.session(token);
  }
}

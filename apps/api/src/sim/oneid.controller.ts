import { Body, Controller, Get, Headers, Inject, Post } from "@nestjs/common";
import { SIM_SESSION_HEADER, SimLoginRequest, type SimCitizen, type SimSession } from "@lex/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OneIdSimulatorService } from "./oneid.service";

/** SIMULATOR — OneID login with fictional test citizens. */
@Controller("sim/oneid")
export class OneIdSimulatorController {
  constructor(@Inject(OneIdSimulatorService) private readonly oneId: OneIdSimulatorService) {}

  @Get("citizens")
  citizens(): readonly SimCitizen[] {
    return this.oneId.listCitizens();
  }

  @Post("login")
  login(@Body(new ZodValidationPipe(SimLoginRequest)) body: SimLoginRequest): Promise<SimSession> {
    return this.oneId.login(body.citizenId);
  }

  @Get("session")
  session(@Headers(SIM_SESSION_HEADER) token: string | undefined): SimSession {
    return this.oneId.session(token);
  }
}

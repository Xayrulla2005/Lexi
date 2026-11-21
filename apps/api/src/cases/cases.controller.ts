import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AddMessageRequest, CreateCaseRequest, type Case, type CaseMessage } from "@lex/contracts";
import type { AuthenticatedCitizen } from "../auth/auth-provider";
import { CitizenAuthGuard, CurrentCitizen } from "../auth/citizen-auth.guard";
import { RateLimit } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CasesService } from "./cases.service";

/** Direct case API. Authenticated citizens only; the owner comes from the session, never from the body. */
@Controller("cases")
@UseGuards(CitizenAuthGuard)
export class CasesController {
  constructor(@Inject(CasesService) private readonly cases: CasesService) {}

  @Post()
  @RateLimit("create")
  async create(
    @Body(new ZodValidationPipe(CreateCaseRequest)) body: CreateCaseRequest,
    @CurrentCitizen() auth: AuthenticatedCitizen,
  ): Promise<Case> {
    const c = this.cases.create(body.channel, auth.citizen.id);
    await this.cases.persist("case.create");
    return c;
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentCitizen() auth: AuthenticatedCitizen): Case {
    return this.cases.owned(id, auth.citizen.id);
  }

  @Post(":id/messages")
  async addMessage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddMessageRequest)) body: AddMessageRequest,
    @CurrentCitizen() auth: AuthenticatedCitizen,
  ): Promise<CaseMessage> {
    // TODO(Xayrulla+Jayhun): voice input -> SpeechToTextProvider (ai/models) -> text
    this.cases.owned(id, auth.citizen.id);
    const msg = this.cases.addMessage(id, body.text);
    await this.cases.persist("case.message");
    return msg;
  }

  @Post(":id/analyze")
  @HttpCode(200)
  @RateLimit("ai")
  async analyze(@Param("id", ParseUUIDPipe) id: string, @CurrentCitizen() auth: AuthenticatedCitizen): Promise<Case> {
    this.cases.owned(id, auth.citizen.id);
    const c = await this.cases.analyze(id);
    await this.cases.persist("case.analyze");
    return c;
  }
}

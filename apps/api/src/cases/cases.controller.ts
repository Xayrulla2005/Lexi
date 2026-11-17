import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { AddMessageRequest, CreateCaseRequest, type Case, type CaseMessage } from "@lex/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CasesService } from "./cases.service";

@Controller("cases")
export class CasesController {
  constructor(@Inject(CasesService) private readonly cases: CasesService) {}

  @Post()
  async create(@Body(new ZodValidationPipe(CreateCaseRequest)) body: CreateCaseRequest): Promise<Case> {
    const c = this.cases.create(body.channel, body.userId ?? null);
    await this.cases.persist("case.create");
    return c;
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string): Case {
    return this.cases.get(id);
  }

  @Post(":id/messages")
  async addMessage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddMessageRequest)) body: AddMessageRequest,
  ): Promise<CaseMessage> {
    // TODO(Xayrulla+Jayhun): voice input -> SpeechToTextProvider (ai/models) -> text
    const msg = this.cases.addMessage(id, body.text);
    await this.cases.persist("case.message");
    return msg;
  }

  @Post(":id/analyze")
  @HttpCode(200)
  async analyze(@Param("id", ParseUUIDPipe) id: string): Promise<Case> {
    const c = await this.cases.analyze(id);
    await this.cases.persist("case.analyze");
    return c;
  }
}

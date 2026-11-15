import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { AddMessageRequest, CreateCaseRequest, type Case, type CaseMessage } from "@lex/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CasesService } from "./cases.service";

@Controller("cases")
export class CasesController {
  constructor(@Inject(CasesService) private readonly cases: CasesService) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateCaseRequest)) body: CreateCaseRequest): Case {
    return this.cases.create(body.channel, body.userId ?? null);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string): Case {
    return this.cases.get(id);
  }

  @Post(":id/messages")
  addMessage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddMessageRequest)) body: AddMessageRequest,
  ): CaseMessage {
    // TODO(Xayrulla+Jayhun): voice input -> SpeechToTextProvider (ai/models) -> text
    return this.cases.addMessage(id, body.text);
  }

  @Post(":id/analyze")
  @HttpCode(200)
  analyze(@Param("id", ParseUUIDPipe) id: string): Promise<Case> {
    return this.cases.analyze(id);
  }
}

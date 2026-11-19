import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import {
  ConversationActionRequest,
  ConversationMessageRequest,
  SIM_SESSION_HEADER,
  StartConversationRequest,
  type Conversation,
} from "@lex/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ConversationsService } from "./conversations.service";

/**
 * Lexi conversation API (web and bot). The optional x-sim-session header links the
 * conversation to a (simulated) OneID citizen for the ACTION and TRACKING steps.
 */
@Controller("conversations")
export class ConversationsController {
  constructor(@Inject(ConversationsService) private readonly conversations: ConversationsService) {}

  @Post()
  start(@Body(new ZodValidationPipe(StartConversationRequest)) body: StartConversationRequest): Promise<Conversation> {
    return this.conversations.start(body.channel);
  }

  /** Polled by the web/bot: includes new tracking messages. */
  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string, @Headers(SIM_SESSION_HEADER) token?: string): Promise<Conversation> {
    return this.conversations.get(id, token);
  }

  @Post(":id/messages")
  @HttpCode(200)
  message(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ConversationMessageRequest)) body: ConversationMessageRequest,
    @Headers(SIM_SESSION_HEADER) token?: string,
  ): Promise<Conversation> {
    return this.conversations.message(id, body.text, token);
  }

  /** Buttons: offer_yes/offer_no, escalate_yes/escalate_no, call:<agency>, call_confirm:<agency>, call_cancel. */
  @Post(":id/actions")
  @HttpCode(200)
  action(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ConversationActionRequest)) body: ConversationActionRequest,
    @Headers(SIM_SESSION_HEADER) token?: string,
  ): Promise<Conversation> {
    return this.conversations.action(id, body.action, token);
  }
}

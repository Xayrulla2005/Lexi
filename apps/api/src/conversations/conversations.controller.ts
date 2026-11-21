import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  ClaimConversationRequest,
  CONVERSATION_TOKEN_HEADER,
  ConversationActionRequest,
  ConversationMessageRequest,
  StartConversationRequest,
  type Conversation,
  type ConversationAccess,
  type ConversationHandoff,
  type StartedConversation,
} from "@lex/contracts";
import type { AuthenticatedCitizen } from "../auth/auth-provider";
import { CurrentCitizen, OptionalCitizenAuthGuard } from "../auth/citizen-auth.guard";
import { RateLimit } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { type AccessContext, ConversationsService } from "./conversations.service";

const ctx = (auth: AuthenticatedCitizen | null, token: string | undefined): AccessContext => ({
  citizenId: auth?.citizen.id ?? null,
  token: token || undefined,
});

/**
 * Lexi conversation API (web and bot). Every request on an existing conversation needs its
 * access token (x-conversation-token, returned by POST /conversations) or the owner's session.
 * The citizen is resolved server-side by the auth provider; the conversation id alone opens nothing.
 */
@Controller("conversations")
@UseGuards(OptionalCitizenAuthGuard)
export class ConversationsController {
  constructor(@Inject(ConversationsService) private readonly conversations: ConversationsService) {}

  /** Returns the conversation and its access token (shown only here). */
  @Post()
  @RateLimit("create")
  start(
    @Body(new ZodValidationPipe(StartConversationRequest)) body: StartConversationRequest,
    @CurrentCitizen() auth: AuthenticatedCitizen | null,
  ): Promise<StartedConversation> {
    return this.conversations.start(body.channel, auth?.citizen.id ?? null);
  }

  /** Polled by the web/bot: includes new tracking messages. */
  @Get(":id")
  get(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentCitizen() auth: AuthenticatedCitizen | null,
    @Headers(CONVERSATION_TOKEN_HEADER) token?: string,
  ): Promise<Conversation> {
    return this.conversations.get(id, ctx(auth, token));
  }

  @Post(":id/messages")
  @HttpCode(200)
  @RateLimit("ai")
  message(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ConversationMessageRequest)) body: ConversationMessageRequest,
    @CurrentCitizen() auth: AuthenticatedCitizen | null,
    @Headers(CONVERSATION_TOKEN_HEADER) token?: string,
  ): Promise<Conversation> {
    return this.conversations.message(id, body.text, ctx(auth, token));
  }

  /** Buttons: offer_yes/offer_no, escalate_yes/escalate_no, call:<agency>, call_confirm:<agency>, call_cancel. */
  @Post(":id/actions")
  @HttpCode(200)
  @RateLimit("ai")
  action(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ConversationActionRequest)) body: ConversationActionRequest,
    @CurrentCitizen() auth: AuthenticatedCitizen | null,
    @Headers(CONVERSATION_TOKEN_HEADER) token?: string,
  ): Promise<Conversation> {
    return this.conversations.action(id, body.action, ctx(auth, token));
  }

  /** One-time code (15 min) to open this conversation on another device, e.g. bot -> web. */
  @Post(":id/handoff")
  @HttpCode(200)
  handoff(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentCitizen() auth: AuthenticatedCitizen | null,
    @Headers(CONVERSATION_TOKEN_HEADER) token?: string,
  ): Promise<ConversationHandoff> {
    return this.conversations.handoff(id, ctx(auth, token));
  }

  /** Exchanges a handoff code for this device's own access token. The code works once. */
  @Post(":id/claim")
  @HttpCode(200)
  @RateLimit("auth")
  claim(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ClaimConversationRequest)) body: ClaimConversationRequest,
  ): Promise<ConversationAccess> {
    return this.conversations.claim(id, body.code);
  }

  /** Revokes the presented access token. */
  @Post(":id/logout")
  @HttpCode(204)
  async logout(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentCitizen() auth: AuthenticatedCitizen | null,
    @Headers(CONVERSATION_TOKEN_HEADER) token?: string,
  ): Promise<void> {
    await this.conversations.revokeToken(id, ctx(auth, token));
  }
}

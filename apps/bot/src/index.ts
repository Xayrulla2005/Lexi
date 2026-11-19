/** XAYRULLA: bot mantig'i. Dilfuza faqat texts.uz.ts va keyboards.ts ni o'zgartiradi. */
import "./load-env";
import { Bot, type Context, InlineKeyboard } from "grammy";
import type { Conversation } from "@lex/contracts";
import { api } from "./api";
import { parseCallback, renderMessage } from "./lexi";
import { texts } from "./texts.uz";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN .env da yo'q");

/** Voice messages are mentioned in the greeting only when speech-to-text is switched on. */
const sttEnabled = (process.env.STT_ENABLED ?? "false").toLowerCase() === "true";
const webUrl = (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const TRACK_MS = 15_000;

const bot = new Bot(token);

/** chat id -> conversation id and how many messages were already shown. TODO: persist. */
const chats = new Map<number, { conversationId: string; shown: number }>();

/** Sends the Lexi messages the chat has not seen yet (questions come one at a time). */
async function showNew(chatId: number, conv: Conversation, send: (text: string, kb?: InlineKeyboard) => Promise<unknown>) {
  const state = chats.get(chatId) ?? { conversationId: conv.id, shown: 0 };
  const fresh = conv.messages.slice(state.shown).filter((m) => m.role === "lexi");
  for (const m of fresh) {
    const { text, buttons } = renderMessage(m, texts, webUrl, conv.id);
    const kb = new InlineKeyboard();
    buttons.forEach((b, i) => {
      if (b.url) kb.url(b.label, b.url);
      else if (b.callback) kb.text(b.label, b.callback);
      if (i < buttons.length - 1) kb.row();
    });
    try {
      await send(text, buttons.length ? kb : undefined);
    } catch {
      // Telegram rejects localhost URL buttons: send the text with the links instead.
      const links = buttons.filter((b) => b.url).map((b) => `${b.label}: ${b.url}`);
      await send([text, ...links].join("\n"));
    }
  }
  chats.set(chatId, { conversationId: conv.id, shown: conv.messages.length });
}

const sender = (ctx: Context) => (text: string, kb?: InlineKeyboard) =>
  ctx.reply(text, { reply_markup: kb, link_preview_options: { is_disabled: true } });

async function conversationFor(chatId: number): Promise<Conversation> {
  const known = chats.get(chatId);
  if (known) return api.getConversation(known.conversationId);
  const conv = await api.startConversation();
  chats.set(chatId, { conversationId: conv.id, shown: 0 });
  return conv;
}

bot.command("start", async (ctx) => {
  chats.delete(ctx.chat.id);
  await ctx.reply(sttEnabled ? texts.start : texts.startTextOnly);
  const conv = await api.startConversation();
  // The web greeting is replaced by the bot greeting above.
  chats.set(ctx.chat.id, { conversationId: conv.id, shown: conv.messages.length });
});

bot.on("message:voice", (ctx) => ctx.reply(texts.voiceSoon)); // TODO: STT (ai/models SpeechToTextProvider)

bot.on("message:text", async (ctx) => {
  try {
    const conv = await conversationFor(ctx.chat.id);
    const next = await api.say(conv.id, ctx.message.text);
    await showNew(ctx.chat.id, next, sender(ctx));
  } catch (e) {
    // Never log the user's text: only the error message.
    console.error((e as Error).message);
    await ctx.reply(texts.error);
  }
});

bot.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  const parsed = parseCallback(ctx.callbackQuery.data);
  if (!chatId || !parsed) return;
  try {
    const conv = await conversationFor(chatId);
    const action = conv.messages.find((m) => m.id === parsed.messageId)?.actions[parsed.index];
    if (!action) return;
    const next = action.kind === "reply" ? await api.say(conv.id, action.value) : await api.act(conv.id, action.value);
    await showNew(chatId, next, sender(ctx));
  } catch (e) {
    console.error((e as Error).message);
    await ctx.reply(texts.error);
  }
});

// TRACKING: status changes of submitted applications arrive as Lexi messages.
setInterval(() => {
  for (const [chatId, state] of chats) {
    api
      .getConversation(state.conversationId)
      .then((conv) => (conv.applicationId ? showNew(chatId, conv, (text, kb) => bot.api.sendMessage(chatId, text, { reply_markup: kb })) : undefined))
      .catch(() => undefined);
  }
}, TRACK_MS).unref();

bot.start();
console.log("Bot ishga tushdi");

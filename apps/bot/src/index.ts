/** XAYRULLA: bot mantig'i. Dilfuza faqat texts.uz.ts va keyboards.ts ni o'zgartiradi. */
import "./load-env";
import { Bot, type Context, type InlineKeyboard } from "grammy";
import type { Case } from "@lex/contracts";
import { api } from "./api";
import { emergencyKeyboard, webApplicationKeyboard } from "./keyboards";
import { composeReply, webApplicationUrl } from "./reply";
import { texts } from "./texts.uz";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN .env da yo'q");

/** Voice messages are mentioned in the greeting only when speech-to-text is switched on. */
const sttEnabled = (process.env.STT_ENABLED ?? "false").toLowerCase() === "true";
const webUrl = process.env.WEB_URL ?? "http://localhost:3000";

const bot = new Bot(token);

/**
 * Sends one message with an inline keyboard; if Telegram rejects the keyboard (e.g. a
 * localhost or tel: URL), sends the same text without it, plus the link as plain text.
 */
async function replyWithKeyboard(ctx: Context, text: string, keyboard: InlineKeyboard, fallbackLink: string | null) {
  try {
    await ctx.reply(text, { reply_markup: keyboard, link_preview_options: { is_disabled: true } });
  } catch {
    await ctx.reply(fallbackLink ? `${text}\n\n${texts.prepareOnWebLink} ${fallbackLink}` : text, {
      link_preview_options: { is_disabled: true },
    });
  }
}

bot.command("start", (ctx) => ctx.reply(sttEnabled ? texts.start : texts.startTextOnly));

bot.on("message:voice", (ctx) => ctx.reply(texts.voiceSoon)); // TODO: STT (ai/models SpeechToTextProvider)

bot.on("message:text", async (ctx) => {
  try {
    await ctx.reply(texts.thinking);
    const c = await api.createCase(String(ctx.from.id));
    await api.addMessage(c.id, ctx.message.text);
    const r: Case = await api.analyze(c.id);
    const decision = r.routingDecision;
    if (!r.analysis || !decision) return ctx.reply(texts.error);

    const text = composeReply(r, texts);
    if (decision.routeType === "EMERGENCY") return replyWithKeyboard(ctx, text, emergencyKeyboard(), null);
    const url = decision.templateId ? webApplicationUrl(webUrl, decision.problemId, ctx.message.text) : null;
    if (!url) return ctx.reply(text, { link_preview_options: { is_disabled: true } });
    return replyWithKeyboard(ctx, text, webApplicationKeyboard(texts.prepareOnWeb, url), url);
  } catch (e) {
    // Never log the user's text: only the error message.
    console.error((e as Error).message);
    await ctx.reply(texts.error);
  }
});

// Old consent buttons may still be on screen in earlier chats: point them to the web.
bot.callbackQuery("send_yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(texts.sendViaWeb);
});
bot.callbackQuery(["send_no", "send_preview"], (ctx) => ctx.answerCallbackQuery());

bot.start();
console.log("Bot ishga tushdi");

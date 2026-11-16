/** XAYRULLA: bot mantig'i. Dilfuza faqat texts.uz.ts va keyboards.ts ni o'zgartiradi. */
import { Bot } from "grammy";
import type { Case } from "@lex/contracts";
import { api, RISK_TONE } from "./api";
import { texts } from "./texts.uz";
import { consentKeyboard, emergencyKeyboard } from "./keyboards";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN .env da yo'q");

const bot = new Bot(token);
const lastCase = new Map<number, Case>(); // TODO: bazaga

bot.command("start", (ctx) => ctx.reply(texts.start));

bot.on("message:voice", (ctx) => ctx.reply(texts.voiceNotReady)); // TODO: STT (ai/models SpeechToTextProvider)

bot.on("message:text", async (ctx) => {
  try {
    await ctx.reply(texts.thinking);
    const c = await api.createCase(String(ctx.from.id));
    await api.addMessage(c.id, ctx.message.text);
    const r = await api.analyze(c.id);
    lastCase.set(ctx.chat.id, r);

    const decision = r.routingDecision;
    if (!r.analysis || !decision) return ctx.reply(texts.error);

    if (decision.routeType === "EMERGENCY") {
      return ctx.reply(texts.emergency, { reply_markup: emergencyKeyboard() });
    }

    const steps = decision.steps.map((s) => `${s.order}. ${s.action}`).join("\n");
    const law = [...decision.legalReferences, ...r.analysis.legalReferences]
      .map((x) => `• ${x.article ? `${x.documentName}, ${x.article}` : x.documentName}`)
      .join("\n");
    await ctx.reply(`${texts.riskLabels[RISK_TONE[r.analysis.risk.level]]}\n\n${texts.resultTitle}\n${steps}\n\n${law}`);
    // Review warning text comes from the routing engine (catalog review status).
    if (decision.reviewNotice) await ctx.reply(`⚠ ${decision.reviewNotice}`);

    if (decision.requiresHumanReview) await ctx.reply(texts.lawyer);
    if (decision.agencyId) await ctx.reply(texts.askSend, { reply_markup: consentKeyboard() });
  } catch (e) {
    console.error(e);
    await ctx.reply(texts.error);
  }
});

// Explicit consent: only the "send_yes" button submits.
bot.callbackQuery("send_yes", async (ctx) => {
  const c = lastCase.get(ctx.chat!.id);
  const agencyId = c?.routingDecision?.agencyId;
  if (!c || !agencyId) return ctx.answerCallbackQuery();
  const s = await api.submit(c.id, agencyId);
  await ctx.answerCallbackQuery();
  await ctx.reply(texts.sent.replace("{id}", s.receiptId));
});

bot.callbackQuery(["send_no", "send_preview"], (ctx) => ctx.answerCallbackQuery());

bot.start();
console.log("Bot ishga tushdi");

/** XAYRULLA: bot mantig'i. Dilfuza faqat texts.uz.ts va keyboards.ts ni o'zgartiradi. */
import { Bot } from "grammy";
import { api, type CaseView } from "./api";
import { texts } from "./texts.uz";
import { consentKeyboard, emergencyKeyboard } from "./keyboards";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN .env da yo'q");

const bot = new Bot(token);
const lastCase = new Map<number, CaseView>(); // TODO: bazaga

bot.command("start", (ctx) => ctx.reply(texts.start));

bot.on("message:voice", (ctx) => ctx.reply(texts.voiceNotReady)); // TODO: STT

bot.on("message:text", async (ctx) => {
  try {
    await ctx.reply(texts.thinking);
    const c = await api.createCase(String(ctx.from.id));
    await api.addMessage(c.id, ctx.message.text);
    const r = await api.analyze(c.id);
    lastCase.set(ctx.chat.id, r);

    const level = r.analysis?.risk.level ?? "yellow";
    if (level === "red") {
      return ctx.reply(texts.emergency, { reply_markup: emergencyKeyboard() });
    }

    const steps = (r.route?.steps ?? []).map((s) => `${s.order}. ${s.action}`).join("\n");
    const law = (r.analysis?.rights ?? []).map((x) => `• ${x.text}`).join("\n");
    await ctx.reply(`${texts.riskLabels[level]}\n\n${texts.resultTitle}\n${steps}\n\n${law}`);

    if (r.analysis?.needs_lawyer) return ctx.reply(texts.lawyer);
    await ctx.reply(texts.askSend, { reply_markup: consentKeyboard() });
  } catch (e) {
    console.error(e);
    await ctx.reply(texts.error);
  }
});

bot.callbackQuery("send_yes", async (ctx) => {
  const c = lastCase.get(ctx.chat!.id);
  const step = c?.route?.steps.find((s) => s.agency_id !== "ish_beruvchi") ?? c?.route?.steps[0];
  if (!c || !step) return ctx.answerCallbackQuery();
  const a = await api.submitAppeal(c.id, step.agency_id);
  await ctx.answerCallbackQuery();
  await ctx.reply(texts.sent.replace("{id}", a.external_id));
});

bot.callbackQuery(["send_no", "send_preview"], (ctx) => ctx.answerCallbackQuery());

bot.start();
console.log("Bot ishga tushdi");

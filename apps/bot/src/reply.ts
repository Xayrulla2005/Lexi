/**
 * XAYRULLA: one bot message per analysis: risk, steps, laws, short analysis, review notice.
 * The lawyer hint is shown only on the fallback route. Pure functions (unit-tested).
 */
import type { Case } from "@lex/contracts";
import { RISK_TONE } from "./api";
import type { texts as Texts } from "./texts.uz";

/** Telegram's message limit is 4096 characters. */
const MAX_LEN = 3900;

export function composeReply(c: Case, t: typeof Texts): string {
  const d = c.routingDecision;
  const a = c.analysis;
  if (!d || !a) return t.error;
  if (d.routeType === "EMERGENCY") {
    return [t.emergency, "", ...d.steps.map((s) => `${s.order}. ${s.action}`)].join("\n");
  }
  const parts: string[] = [t.riskLabels[RISK_TONE[a.risk.level]], "", t.resultTitle, ...d.steps.map((s) => `${s.order}. ${s.action}`)];

  const laws = [...d.legalReferences, ...a.legalReferences].map((x) => (x.article ? `${x.documentName}, ${x.article}` : x.documentName));
  if (laws.length) parts.push("", t.lawsTitle, ...[...new Set(laws)].map((l) => `• ${l}`));

  const summary = c.legalAnalysis?.summary.map((s) => s.text) ?? [];
  if (summary.length) parts.push("", t.analysisTitle, summary.join(" "));

  if (d.reviewNotice) parts.push("", `⚠ ${d.reviewNotice}`);
  if (d.routeType === "FALLBACK") parts.push("", t.lawyer);

  const text = parts.join("\n");
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1)}…` : text;
}

/** Web link with the story pre-filled; the text is shortened to keep the URL small. */
export function webApplicationUrl(base: string, problemId: string | null, story: string): string {
  const q = new URLSearchParams();
  if (problemId) q.set("problemId", problemId);
  q.set("text", story.slice(0, 500));
  return `${base.replace(/\/+$/, "")}/?${q.toString()}`;
}

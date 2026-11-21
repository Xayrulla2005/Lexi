/**
 * XAYRULLA: Lexi suhbat xabarlarini Telegram uchun matn + tugmalarga aylantirish (sof funksiyalar).
 * Telegram tel: tugmasini qo'llamaydi, shuning uchun telefonlar matnda yoziladi.
 */
import type { ChatCard, ConversationMessage } from "@lex/contracts";
import type { texts as Texts } from "./texts.uz";

export interface BotButton {
  label: string;
  /** Callback data ("a:<messageId>:<index>") or a URL. */
  callback?: string;
  url?: string;
}

const MAX_LEN = 3900;

/**
 * Link that opens this conversation on the web. The bot never puts its access token in a link:
 * it adds a one-time handoff code (?h=) that the web exchanges for its own token.
 */
export const webLink = (webUrl: string, conversationId: string, handoff?: string): string =>
  `${webUrl}/?c=${conversationId}${handoff ? `&h=${encodeURIComponent(handoff)}` : ""}`;

/** Messages whose rendering contains a web link (they need a handoff code). */
export const needsWebLink = (m: ConversationMessage): boolean =>
  m.card?.type === "application" || m.card?.type === "login" || m.actions.some((a) => a.kind === "action" && a.value === "offer_yes");

const agencyLine = (a: { name: string; phone: string | null; link: string | null }) =>
  [a.name, a.phone, a.link].filter(Boolean).join(" — ");

export function renderCard(card: ChatCard, t: typeof Texts, webUrl: string, conversationId: string, handoff?: string): string {
  switch (card.type) {
    case "emergency":
      return [`⚠ ${t.emergencyTitle}`, ...card.contacts.map((a) => `• ${agencyLine(a)}`)].join("\n");
    case "explanation": {
      const label = (keys: string[]) =>
        keys.map((k) => card.articles.find((a) => a.key === k)).filter(Boolean).map((a) => `[${a?.article}-m.]`).join(" ");
      const block = (title: string, claims: typeof card.rights) =>
        claims.length ? [title, ...claims.map((c) => `• ${c.text} ${label(c.citations)}`)] : [];
      const sources = card.articles.map((a) => `${a.article}-m.: ${a.document} — ${a.sourceUrl}`);
      return [
        ...block(t.rightsTitle, card.rights),
        ...block(t.obligationsTitle, card.obligations),
        ...block(t.deadlinesTitle, card.deadlines),
        ...(sources.length ? [t.sourcesTitle, ...sources] : []),
      ].join("\n");
    }
    case "roadmap": {
      const cite = (keys: readonly string[] | undefined) =>
        (keys ?? []).map((k) => card.articles?.find((a) => a.key === k)).filter(Boolean).map((a) => ` [${a?.article}-m.]`).join("");
      const lines = card.steps.flatMap((s) => [
        `${s.order}. ${s.agency && s.title === s.agency.name ? agencyLine(s.agency) : s.title}${cite(s.citations)}${s.general ? ` ${t.generalLabel}` : ""}`,
        ...(s.agency && s.title !== s.agency.name ? [`   ${agencyLine(s.agency)}`] : []),
        ...(s.documents.length ? [`   ${t.documentsLabel} ${s.documents.join(", ")}`] : []),
        ...(s.deadline ? [`   ${t.deadlineLabel} ${s.deadline}`] : []),
      ]);
      if (card.notYet.length) lines.push(`${t.notYetLabel} ${card.notYet.map((a) => a.name).join(", ")}`);
      if (card.articles?.length) lines.push(t.sourcesTitle, ...card.articles.map((a) => `${a.article}-m.: ${a.document} — ${a.sourceUrl}`));
      return lines.join("\n");
    }
    case "answer": {
      const label = (keys: string[]) =>
        keys.map((k) => card.articles.find((a) => a.key === k)).filter(Boolean).map((a) => `[${a?.article}-m.]`).join(" ");
      return [
        ...card.claims.map((c) => `• ${c.text} ${label(c.citations)}`),
        ...(card.articles.length ? [t.sourcesTitle, ...card.articles.map((a) => `${a.article}-m.: ${a.document} — ${a.sourceUrl}`)] : []),
      ].join("\n");
    }
    case "application":
    case "login":
      return `${t.openOnWeb} ${webLink(webUrl, conversationId, handoff)}`;
    case "status":
      return `${t.statusLabel} ${card.status} · ${card.receiptId} · ${card.agencyName}`;
    case "facts":
      return card.items.map((it) => `• ${it.label}: ${it.value ?? t.unknownValue}`).join("\n");
    case "emergency_call":
      return `${t.callSentTitle}: ${card.call.agencyName}${card.call.phone ? ` (${card.call.phone})` : ""}`;
  }
}

/** One Telegram message per Lexi message: text, card as text, buttons. */
export function renderMessage(
  m: ConversationMessage,
  t: typeof Texts,
  webUrl: string,
  conversationId: string,
  handoff?: string,
): { text: string; buttons: BotButton[] } {
  const parts = [m.text];
  if (m.card) parts.push("", renderCard(m.card, t, webUrl, conversationId, handoff));
  const buttons: BotButton[] = [];
  m.actions.forEach((a, i) => {
    if (a.kind === "tel") return; // phones are in the text
    if (a.kind === "link") {
      buttons.push({ label: a.label, url: a.value.startsWith("http") ? a.value : `${webUrl}${a.value}` });
      return;
    }
    if (a.kind === "action" && a.value === "offer_yes") {
      // OneID + consent + ERI happen on the web, in this same conversation.
      buttons.push({ label: t.signOnWeb, url: webLink(webUrl, conversationId, handoff) });
      return;
    }
    buttons.push({ label: a.label, callback: `a:${m.id}:${i}` });
  });
  const text = parts.join("\n");
  return { text: text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1)}…` : text, buttons };
}

/** Parses "a:<messageId>:<index>" callback data. */
export function parseCallback(data: string): { messageId: string; index: number } | null {
  const m = /^a:([0-9a-f-]{36}):(\d+)$/.exec(data);
  return m ? { messageId: m[1] as string, index: Number(m[2]) } : null;
}

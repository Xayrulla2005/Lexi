import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@lex/contracts";
import { parseCallback, renderMessage } from "./lexi";
import { texts } from "./texts.uz";

const ID = "8c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11";
const msg = (o: Partial<ConversationMessage>): ConversationMessage => ({
  id: "1c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11",
  role: "lexi",
  text: "Matn",
  at: "2026-11-19T00:00:00.000Z",
  card: null,
  actions: [],
  ...o,
});

describe("renderMessage", () => {
  it("emergency: phones in the text, no tel buttons, simulator call as a callback", () => {
    const r = renderMessage(
      msg({
        card: { type: "emergency", signals: ["violence"], contacts: [{ id: "iiv", name: "IIV", phone: "102", link: null, responseDays: null }] },
        actions: [
          { label: "📞 102", kind: "tel", value: "102" },
          { label: "Chaqiruv", kind: "action", value: "call:iiv" },
        ],
      }),
      texts,
      "https://lex.example",
      ID,
    );
    expect(r.text).toContain("• IIV — 102");
    expect(r.buttons).toEqual([{ label: "Chaqiruv", callback: "a:1c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11:1" }]);
  });

  it("ACTION: 'Ha' becomes '📝 Vebda imzolab yuborish' opening this conversation on the web", () => {
    const r = renderMessage(
      msg({ actions: [{ label: "Ha", kind: "action", value: "offer_yes" }, { label: "Yo'q", kind: "action", value: "offer_no" }] }),
      texts,
      "https://lex.example",
      ID,
    );
    expect(r.buttons[0]).toEqual({ label: texts.signOnWeb, url: `https://lex.example/?c=${ID}` });
    expect(r.buttons[1]?.callback).toMatch(/^a:/);
  });

  it("facts card: one 'label: value' line each, unknown values as \"ma'lum emas\"", () => {
    const r = renderMessage(
      msg({ text: "Sizdan olingan ma'lumotlar:", card: { type: "facts", items: [{ label: "Ish beruvchi", value: "Namuna MChJ" }, { label: "Summa", value: null }] } }),
      texts,
      "https://lex.example",
      ID,
    );
    expect(r.text).toBe("Sizdan olingan ma'lumotlar:\n\n• Ish beruvchi: Namuna MChJ\n• Summa: ma'lum emas");
  });

  it("procedure roadmap: citation tags and the 'umumiy yo'nalish' label; answer card with sources", () => {
    const article = { key: "k/1", article: "1", title: "T", document: "Kodeks", sourceUrl: "https://lex.uz/1", text: "..." };
    const road = renderMessage(
      msg({
        card: {
          type: "roadmap",
          source: "procedure",
          notYet: [],
          articles: [article],
          steps: [
            { order: 1, title: "Ariza bering", agency: null, documents: [], deadline: null, citations: ["k/1"], general: false },
            { order: 2, title: "Ko'rikdan o'ting", agency: null, documents: [], deadline: null, citations: [], general: true },
          ],
        },
      }),
      texts,
      "https://lex.example",
      ID,
    );
    expect(road.text).toContain("1. Ariza bering [1-m.]");
    expect(road.text).toContain(`2. Ko'rikdan o'ting ${texts.generalLabel}`);
    const ans = renderMessage(msg({ card: { type: "answer", claims: [{ text: "Gap.", citations: ["k/1"] }], articles: [article] } }), texts, "https://lex.example", ID);
    expect(ans.text).toContain("• Gap. [1-m.]");
    expect(ans.text).toContain("1-m.: Kodeks — https://lex.uz/1");
  });

  it("parses callback data", () => {
    expect(parseCallback("a:1c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11:2")).toEqual({ messageId: "1c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11", index: 2 });
    expect(parseCallback("send_yes")).toBeNull();
  });
});

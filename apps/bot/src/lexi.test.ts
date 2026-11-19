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

  it("parses callback data", () => {
    expect(parseCallback("a:1c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11:2")).toEqual({ messageId: "1c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11", index: 2 });
    expect(parseCallback("send_yes")).toBeNull();
  });
});

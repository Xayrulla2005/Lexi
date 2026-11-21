import { describe, expect, it } from "vitest";
import type { ChatModelProvider } from "../models/provider";
import { answerQuestion, detectIntent, guessIntent, planProcedure, supportShare, validateStep } from "../pipeline/intents";
import type { RetrievedArticle } from "../rag/catalog-retrieval";

const fake = (reply: string): ChatModelProvider => ({ id: "fake", complete: async () => reply });

const ART: RetrievedArticle = {
  key: "mehnat_kodeksi/100",
  code: "mehnat_kodeksi",
  article: "100",
  title: "Ishga qabul qilish",
  document: "Mehnat kodeksi",
  sourceUrl: "https://lex.uz/x",
  status: "DRAFT",
  retrievedAt: "2026-11-17T08:13:19.585Z",
  adoptedOn: "2022-10-28",
  text: "Ishga qabul qilishda xodim pasport va mehnat daftarchasini taqdim etadi. Ariza 3 kun ichida ko'rib chiqiladi.",
  source: "catalog",
  score: null,
};
const byKey = new Map([[ART.key, ART]]);

describe("guessIntent (offline fallback)", () => {
  it("procedure and question wording; everything else is a dispute", () => {
    expect(guessIntent("firma qanday ochiladi")).toBe("procedure");
    expect(guessIntent("meros qanday rasmiylashtiriladi")).toBe("procedure");
    expect(guessIntent("iiv ga ishga kirishim uchun yordam ber")).toBe("procedure");
    expect(guessIntent("ishdan bo'shatishsa kompensatsiya beriladimi")).toBe("question");
    expect(guessIntent("3 oydan beri oylik berishmayapti")).toBe("dispute");
  });
});

describe("detectIntent", () => {
  it("low confidence -> null (ask the user)", async () => {
    expect((await detectIntent(fake('{"intent":"procedure","confidence":0.4}'), "x")).intent).toBeNull();
    expect((await detectIntent(fake('{"intent":"question","confidence":0.9}'), "x")).intent).toBe("question");
  });
  it("broken output falls back to the wording guess", async () => {
    const r = await detectIntent(fake("nonsense"), "firma qanday ochiladi");
    expect(r).toEqual({ intent: "procedure", degraded: true });
  });
});

describe("validateStep", () => {
  const agencies = new Set(["soliq", "iiv"]);
  it("keeps documents and deadline only when the cited article supports them", () => {
    const s = validateStep(
      { title: "Ariza bering", agencyId: "iiv", citations: ["mehnat_kodeksi/100"], documents: ["pasport", "mehnat daftarchasi", "harbiy guvohnoma"], deadline: "3 kun ichida" },
      byKey,
      agencies,
    );
    expect(s.documents).toEqual(["pasport", "mehnat daftarchasi"]);
    expect(s.deadline).toBe("3 kun ichida");
    expect(s.agencyId).toBe("iiv");
  });
  it("uncited step: general, no documents/deadline; unknown agency and citation dropped", () => {
    const s = validateStep(
      { title: "Davlat bojini to'lang", agencyId: "invented", citations: ["fake/1"], documents: ["kvitansiya"], deadline: "10 kun" },
      byKey,
      agencies,
    );
    expect(s).toEqual({ title: "Davlat bojini to'lang", agencyId: null, citations: [], documents: [], deadline: null });
  });
  it("a deadline number missing from the article is dropped", () => {
    const s = validateStep({ title: "x", agencyId: null, citations: ["mehnat_kodeksi/100"], documents: [], deadline: "5 kun ichida" }, byKey, agencies);
    expect(s.deadline).toBeNull();
  });
  it("supportShare counts stems found in the source", () => {
    expect(supportShare("mehnat daftarchasi", ART.text)).toBe(1);
    expect(supportShare("harbiy guvohnoma", ART.text)).toBe(0);
  });
});

describe("planProcedure / answerQuestion", () => {
  it("plan steps are validated", async () => {
    const reply = JSON.stringify({ steps: [{ title: "Ariza", agencyId: "soliq", citations: ["mehnat_kodeksi/100"], documents: [], deadline: null }] });
    const r = await planProcedure(fake(reply), "firma", [ART], [{ id: "soliq", name: "Soliq" }]);
    expect(r.steps).toEqual([{ title: "Ariza", agencyId: "soliq", citations: ["mehnat_kodeksi/100"], documents: [], deadline: null }]);
  });
  it("answer keeps only sentences with valid citations; no articles -> empty", async () => {
    const reply = JSON.stringify({ answer: [{ text: "To'g'ri gap.", citations: ["mehnat_kodeksi/100"] }, { text: "To'qima.", citations: ["x/1"] }] });
    expect((await answerQuestion(fake(reply), "?", [ART])).claims).toEqual([{ text: "To'g'ri gap.", citations: ["mehnat_kodeksi/100"] }]);
    expect((await answerQuestion(fake(reply), "?", [])).claims).toEqual([]);
  });
});

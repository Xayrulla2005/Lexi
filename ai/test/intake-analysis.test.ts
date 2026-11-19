import { describe, expect, it } from "vitest";
import type { ChatModelProvider } from "../models/provider";
import { fieldContexts, isDontKnow, quoteIsInStory, runIntake, shortContext } from "../pipeline/intake";
import { analyzeWithArticles } from "../pipeline/legal-analysis";
import { getArticlesForProblem } from "../rag/catalog-retrieval";
import { filterClaimCitations } from "../rag/citation-validator";

const fake = (reply: string): ChatModelProvider => ({ id: "fake:m", complete: async () => reply });

const T12 = `Men, {{fio}}, lavozimida ishlayman.\n\n{{malumot_1}}\n\ntashkilotida\n\nIsh beruvchi tomonidan 2026-yil {{malumot_3}} oyi uchun belgilangan {{summa}} so‘m ish haqim o‘z vaqtida to‘lanmadi.`;
const STORY = "Men Namuna MChJ da hisobchiman. Sentabr oyi uchun 5 million so'm oyligimni bermayapti.";

describe("shortContext", () => {
  it("keeps a few words around the blank for chat questions", () => {
    expect(shortContext("Kimdan: …, …, tel.: … SHIKOYAT ARIZASI Men, …, lavozimida ishlayman. [____] tashkilotida … Ish beruvchi tomonidan 2026-yil … oyi")).toBe(
      "… SHIKOYAT ARIZASI Men, …, lavozimida ishlayman. [____] tashkilotida … Ish beruvchi tomonidan 2026-yil …",
    );
    expect(shortContext("[____] tashkilotida")).toBe("[____] tashkilotida");
  });
});

describe("fieldContexts", () => {
  it("describes {{malumot_N}} by the surrounding template text", () => {
    const [m3] = fieldContexts(T12, ["malumot_3"]);
    expect(m3?.context).toContain("2026-yil [____] oyi uchun");
  });
});

describe("runIntake", () => {
  const fields = fieldContexts(T12, ["malumot_1", "malumot_3", "summa"]);

  it("keeps only values quoted from the story; asks about the rest (max 3)", async () => {
    const reply = JSON.stringify({
      understood: "Ish beruvchi sentabr oyligini bermagan.",
      fields: [
        { key: "malumot_3", value: "sentabr", evidence: "Sentabr oyi uchun" },
        { key: "summa", value: "5 000 000", evidence: "5 million so'm" },
        { key: "malumot_1", value: "Hisobchi", evidence: "bosh hisobchi lavozimida" }, // not in the story -> dropped
      ],
      questions: [
        { key: "malumot_1", question: "Qaysi lavozimda ishlaysiz?" },
        { key: "summa", question: "Qancha?" }, // already filled -> dropped
      ],
    });
    const r = await runIntake(fake(reply), STORY, fields, "Ish haqi");
    expect(r.extracted.map((e) => e.key)).toEqual(["malumot_3", "summa"]);
    expect(r.questions).toEqual([{ key: "malumot_1", question: "Qaysi lavozimda ishlaysiz?" }]);
    expect(r.degraded).toBe(false);
  });

  it("without an LLM asks template questions and keeps the fallback understanding", async () => {
    const r = await runIntake(null, STORY, fieldContexts(T12, ["malumot_1", "malumot_2", "malumot_3", "summa"]), "Ish haqini o'z vaqtida to'lamaslik");
    expect(r.understood).toBe("Ish haqini o'z vaqtida to'lamaslik");
    expect(r.questions).toHaveLength(3);
    expect(r.extracted).toEqual([]);
    expect(r.degraded).toBe(true);
  });

  it("invalid model output falls back", async () => {
    expect((await runIntake(fake("nonsense"), STORY, fields, "x")).degraded).toBe(true);
  });

  it("quote check and 'bilmayman'", () => {
    expect(quoteIsInStory(STORY, "5 million so‘m")).toBe(true);
    expect(quoteIsInStory(STORY, "10 million")).toBe(false);
    expect(isDontKnow("Bilmayman.")).toBe(true);
    expect(isDontKnow("Не знаю")).toBe(true);
    expect(isDontKnow("5 million")).toBe(false);
  });
});

describe("analyzeWithArticles", () => {
  it("drops citations to articles that were not given, and claims left without one", async () => {
    const articles = getArticlesForProblem("P12");
    const reply = JSON.stringify({
      summary: [{ text: "Ish haqi o'z vaqtida to'lanishi shart.", citations: ["mehnat_kodeksi/253"] }],
      rights: [
        { text: "Kechiktirish uchun kompensatsiya olish huquqi bor.", citations: ["mehnat_kodeksi/333", "jinoyat_kodeksi/999"] },
        { text: "O'ylab topilgan huquq.", citations: ["fuqarolik_kodeksi/1"] },
      ],
      obligations: [],
      deadlines: [],
    });
    const a = await analyzeWithArticles(fake(reply), STORY, articles, "Bu yo'l hali yurist tomonidan tekshirilmagan");
    expect(a.rights).toEqual([{ text: "Kechiktirish uchun kompensatsiya olish huquqi bor.", citations: ["mehnat_kodeksi/333"] }]);
    expect(a.droppedCitations).toBe(2);
    expect(a.articles.map((x) => x.key)).toEqual(["mehnat_kodeksi/253", "mehnat_kodeksi/333"]);
    expect(a.reviewNotice).toBe("Bu yo'l hali yurist tomonidan tekshirilmagan");
  });

  it("filterClaimCitations removes unknown keys", () => {
    const r = filterClaimCitations([{ text: "a", citations: ["x", "y"] }], new Set(["y"]));
    expect(r).toEqual({ claims: [{ text: "a", citations: ["y"] }], dropped: 1 });
  });
});

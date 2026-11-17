import { describe, expect, it } from "vitest";
import { chunkArticle, loadArticles, search, type ArticleFile, type LegalIndex } from "../rag/legal-index";

const article = (paragraphs: string[]): ArticleFile => ({
  code: "test_kodeksi",
  articleId: "1",
  document: "Test",
  article: "1",
  title: "Sinov",
  sourceUrl: "https://lex.uz/uz/docs/-1#-2",
  retrievedAt: "2026-11-17T00:00:00.000Z",
  status: "DRAFT",
  problemIds: ["P01"],
  headingLine: "1-modda. Sinov",
  paragraphs,
});

describe("chunkArticle", () => {
  it("keeps a short article in one chunk with its heading", () => {
    const [c, ...rest] = chunkArticle(article(["Birinchi qism.", "Ikkinchi qism."]));
    expect(rest).toEqual([]);
    expect(c?.text).toBe("1-modda. Sinov\nBirinchi qism.\nIkkinchi qism.");
    expect(c).toMatchObject({ id: "test_kodeksi/1#1", part: 1, parts: 1 });
  });

  it("splits a long article on paragraph boundaries without losing text", () => {
    const paras = Array.from({ length: 6 }, (_, i) => `${i + 1}. ${"soʻz ".repeat(60).trim()}.`);
    const chunks = chunkArticle(article(paras), 800);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.startsWith("1-modda. Sinov\n")).toBe(true);
      expect(c.text.length).toBeLessThanOrEqual(800);
    }
    const body = chunks.map((c) => c.text.replace("1-modda. Sinov\n", "")).join("\n");
    expect(body).toBe(paras.join("\n"));
  });
});

describe("search", () => {
  it("ranks by cosine similarity", () => {
    const base = chunkArticle(article(["x"]))[0]!;
    const index: LegalIndex = {
      model: "test",
      createdAt: "",
      dim: 2,
      maxChunkChars: 2000,
      chunks: [
        { ...base, id: "a", vector: [1, 0] },
        { ...base, id: "b", vector: [0, 1] },
      ],
    };
    expect(search(index, [0.1, 0.99], 1).map((c) => c.id)).toEqual(["b"]);
  });
});

describe("fetched articles", () => {
  it("every article file has DRAFT status, a lex.uz source and text", () => {
    const all = loadArticles();
    expect(all.length).toBeGreaterThanOrEqual(95);
    for (const a of all) {
      expect(a.status).toBe("DRAFT");
      expect(a.sourceUrl).toMatch(/^https:\/\/lex\.uz\/uz\/docs\/-\d+#-?\d+$/);
      expect(a.paragraphs.length).toBeGreaterThan(0);
      expect(a.headingLine).toMatch(new RegExp(`^${a.article}-modda\\. `));
    }
  });
});

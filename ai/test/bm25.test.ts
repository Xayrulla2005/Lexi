import { describe, expect, it } from "vitest";
import { Bm25, rrf, tokenize } from "../rag/bm25";
import { defaultRetrievalMode, type Chunk, type RetrievedChunk } from "../rag/legal-index";

const chunk = (id: string, text: string): Chunk => ({
  id,
  code: "k",
  article: id,
  title: id,
  document: "d",
  sourceUrl: "u",
  status: "DRAFT",
  problemIds: [],
  part: 1,
  parts: 1,
  text,
});

describe("tokenize", () => {
  it("normalizes Cyrillic and apostrophes, drops stopwords, stems", () => {
    expect(tokenize("Ойлик ва ish haqini toʻlash")).toEqual(["oylik", "ish", "haqini", "tolash"]);
  });
});

describe("Bm25", () => {
  it("ranks the chunk with the query terms first", () => {
    const bm = new Bm25([chunk("a", "Ish haqini toʻlash muddatlari"), chunk("b", "Oldi-sotdi shartnomasi"), chunk("c", "Mulk ijarasi")]);
    expect(bm.rank("ish haqi toʻlanmadi")[0]?.id).toBe("a");
    expect(bm.rank("hech narsa").length).toBe(0);
  });
});

describe("rrf", () => {
  it("fuses rankings by reciprocal rank", () => {
    const r = (ids: string[]): RetrievedChunk[] => ids.map((id) => ({ ...chunk(id, id), score: 1 }));
    expect(rrf([r(["a", "b", "c"]), r(["b", "c", "a"])], 2).map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("defaultRetrievalMode", () => {
  it("is dense unless RAG_MODE opts in", () => {
    expect(defaultRetrievalMode({})).toBe("dense");
    expect(defaultRetrievalMode({ RAG_MODE: "hybrid" })).toBe("hybrid");
    expect(defaultRetrievalMode({ RAG_MODE: "nonsense" })).toBe("dense");
  });
});

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../eval/csv";
import {
  getArticlesForProblem,
  missingArticlesForProblem,
  NEEDED_ARTICLES_FILE,
  RAG_EXTRA_K,
  RAG_ONLY_K,
  retrieveForAnalysis,
  type RagSearch,
} from "../rag/catalog-retrieval";
import { ARTICLES_DIR, getIndex } from "../rag/legal-index";

interface Needed {
  codes: { key: string; articles: { id: string; problemIds: string[] }[] }[];
}
const needed = JSON.parse(readFileSync(NEEDED_ARTICLES_FILE, "utf8")) as Needed;

/** Expected catalog articles for a problem, computed independently from the module. */
function expectedKeys(problemId: string): string[] {
  return needed.codes.flatMap((c) =>
    c.articles
      .filter((a) => a.problemIds.includes(problemId) && existsSync(join(ARTICLES_DIR, c.key, `${a.id}.md`)))
      .map((a) => `${c.key}/${a.id}`),
  );
}

/** Deterministic stand-in for the embedding search: index chunks in a fixed order. */
const fakeRag: RagSearch = async (_q, k) =>
  getIndex()
    .chunks.slice(0, k)
    .map(({ vector: _v, ...c }) => ({ ...c, score: 0.5 }));

const problemsWithArticles = [...new Set(needed.codes.flatMap((c) => c.articles.flatMap((a) => a.problemIds)))].sort();

describe("getArticlesForProblem", () => {
  it("returns exactly the catalog articles for every problem (recall 100%)", () => {
    expect(problemsWithArticles.length).toBeGreaterThan(40);
    for (const p of problemsWithArticles) {
      const got = getArticlesForProblem(p);
      expect(got.map((a) => a.key)).toEqual(expectedKeys(p));
      for (const a of got) {
        expect(a.source).toBe("catalog");
        expect(a.status).toBe("DRAFT");
        expect(a.text.length).toBeGreaterThan(20);
      }
    }
  });

  it("P12 -> Mehnat kodeksi 253 and 333", () => {
    expect(getArticlesForProblem("P12").map((a) => a.key)).toEqual(["mehnat_kodeksi/253", "mehnat_kodeksi/333"]);
  });

  it("reports catalog articles without text (only JK 272 for P39)", () => {
    expect(missingArticlesForProblem("P39")).toEqual(["jinoyat_kodeksi/272"]);
    expect(problemsWithArticles.filter((p) => missingArticlesForProblem(p).length).sort()).toEqual(["P39"]);
  });

  it("returns nothing for a problem without catalog articles", () => {
    expect(getArticlesForProblem("P58")).toEqual([]);
  });
});

describe("retrieveForAnalysis", () => {
  const stories = parseCsv(readFileSync(join(__dirname, "../eval/datasets/test_cases.csv"), "utf8")).filter(
    (r) => r.hikoya && problemsWithArticles.includes(r.problem_id as string),
  );

  it("with the correct problemId every story gets all its catalog articles (recall 100%)", async () => {
    expect(stories.length).toBe(205);
    let hits = 0;
    for (const s of stories) {
      const out = await retrieveForAnalysis(s.hikoya as string, s.problem_id as string, fakeRag);
      const catalog = out.filter((a) => a.source === "catalog").map((a) => a.key);
      if (expectedKeys(s.problem_id as string).every((k) => catalog.includes(k))) hits++;
    }
    expect(hits / stories.length).toBe(1);
  });

  it("adds at most 3 RAG articles, never duplicates, catalog first", async () => {
    const out = await retrieveForAnalysis("oylik", "P12", fakeRag);
    const keys = out.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(out.slice(0, 2).map((a) => a.source)).toEqual(["catalog", "catalog"]);
    const rag = out.filter((a) => a.source === "rag");
    expect(rag.length).toBeLessThanOrEqual(RAG_EXTRA_K);
    expect(rag.every((a) => !["mehnat_kodeksi/253", "mehnat_kodeksi/333"].includes(a.key))).toBe(true);
  });

  it("without a problemId returns only RAG articles (top 5 distinct)", async () => {
    const out = await retrieveForAnalysis("nimadir", null, fakeRag);
    expect(out.length).toBe(RAG_ONLY_K);
    expect(out.every((a) => a.source === "rag")).toBe(true);
    expect(new Set(out.map((a) => a.key)).size).toBe(out.length);
  });
});

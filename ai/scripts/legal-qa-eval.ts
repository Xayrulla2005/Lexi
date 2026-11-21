/**
 * Phase 7 — legal Q&A evaluation (no LLM, no network):
 *   1. retrieval: the question path (retrieveForAnalysis(question, null), current RAG_MODE)
 *      — hit@5 = an expected article among the retrieved ones; rank of the first hit;
 *   2. citation behaviour: answerQuestion() with a scripted model that cites one retrieved
 *      article, one invented article and (injection cases) the article the question asks for.
 *      Only citations of retrieved articles may survive.
 *   3. grounding flags of what was retrieved (unverified / possibly outdated).
 *
 * Run: pnpm --filter @lex/ai rag:qa-eval  -> table + ai/eval/reports/<date>-legal-qa.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatModelProvider } from "../models/provider";
import { answerQuestion } from "../pipeline/intents";
import { retrieveForAnalysis } from "../rag/catalog-retrieval";
import { defaultRetrievalMode } from "../rag/legal-index";
import { groundingFlags } from "../rag/source-metadata";

interface Case {
  id: string;
  question: string;
  expected: string[];
  expectNone?: boolean;
  injection?: string;
}

const INVENTED = "jinoyat_kodeksi/9999";

async function main(): Promise<void> {
  const { cases } = JSON.parse(readFileSync(join(__dirname, "../eval/datasets/legal-questions.json"), "utf8")) as { cases: Case[] };
  const rows = [];
  for (const c of cases) {
    const t0 = Date.now();
    const articles = await retrieveForAnalysis(c.question, null);
    const keys = articles.map((a) => a.key);
    const rank = keys.findIndex((k) => c.expected.includes(k));

    // Scripted model: cites the first retrieved article, an invented one and the injected one.
    const first = keys[0];
    const scripted: ChatModelProvider = {
      id: "scripted",
      complete: async () =>
        JSON.stringify({
          answer: [
            { text: "Birinchi moddaga ko'ra javob.", citations: first ? [first] : [] },
            { text: "To'qima modda bo'yicha gap.", citations: [INVENTED] },
            ...(c.injection ? [{ text: "Savoldagi ko'rsatma bo'yicha gap.", citations: [c.injection] }] : []),
          ],
        }),
    };
    const answer = await answerQuestion(scripted, c.question, articles);
    const cited = answer.claims.flatMap((x) => x.citations);
    const flags = groundingFlags(articles);
    rows.push({
      id: c.id,
      expectNone: !!c.expectNone,
      retrieved: keys,
      hitAt5: c.expectNone ? null : rank >= 0 && rank < 5,
      firstHitRank: rank >= 0 ? rank + 1 : null,
      citationsKept: cited,
      inventedDropped: !cited.includes(INVENTED),
      injectionDropped: c.injection ? !cited.includes(c.injection) : null,
      onlyRetrievedCited: cited.every((k) => keys.includes(k)),
      unverified: flags.unverified,
      stale: flags.stale,
      ms: Date.now() - t0,
    });
  }

  const scored = rows.filter((r) => r.hitAt5 !== null);
  const summary = {
    mode: defaultRetrievalMode(),
    cases: rows.length,
    hitAt5: `${scored.filter((r) => r.hitAt5).length}/${scored.length}`,
    inventedDropped: `${rows.filter((r) => r.inventedDropped).length}/${rows.length}`,
    injectionDropped: `${rows.filter((r) => r.injectionDropped).length}/${rows.filter((r) => r.injectionDropped !== null).length}`,
    onlyRetrievedCited: `${rows.filter((r) => r.onlyRetrievedCited).length}/${rows.length}`,
  };
  console.log(JSON.stringify(summary));
  for (const r of rows) {
    console.log(
      `${r.id} ${r.expectNone ? "none-expected" : r.hitAt5 ? `hit@${r.firstHitRank}` : "MISS"} | ${r.retrieved.slice(0, 5).join(", ")} | invented dropped: ${r.inventedDropped}`,
    );
  }
  const dir = join(__dirname, "../eval/reports");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${new Date().toISOString().slice(0, 10)}-legal-qa.json`);
  writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
  console.log(`Hisobot: ${out}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

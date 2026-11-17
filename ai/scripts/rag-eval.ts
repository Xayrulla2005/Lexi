/**
 * Retrieval recall@k on ai/eval/datasets/test_cases.csv (no LLM), for three modes:
 * dense (bge-m3), bm25 (keywords) and hybrid (RRF of both).
 * A story is a hit when at least one of the top-k chunks belongs to an article that the
 * catalog cites for the story's problem (article frontmatter `problem_ids`).
 * Stories whose problem cites no fetched article are excluded and counted separately.
 *
 * Run: pnpm rag:eval [k]   -> console table + ai/eval/reports/<date>-rag-recall.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../eval/csv";
import { getEmbedder } from "../rag/embeddings";
import { loadIndex, rankChunks, type RetrievalMode } from "../rag/legal-index";

const STYLE_ORDER = ["rasmiy", "qisqa", "sheva", "aralash", "kirill"];
const MODES: RetrievalMode[] = ["dense", "bm25", "hybrid"];

interface Stat {
  n: number;
  hit: number;
}

async function main(): Promise<void> {
  const k = Number(process.argv[2] ?? 5);
  const index = loadIndex();
  const embedder = await getEmbedder();
  if (embedder.id !== index.model) throw new Error(`index ${index.model} != embedder ${embedder.id}; run pnpm rag:index`);

  const covered = new Set(index.chunks.flatMap((c) => c.problemIds));
  const rows = parseCsv(readFileSync(join(__dirname, "../eval/datasets/test_cases.csv"), "utf8")).filter((r) => r.hikoya);
  const evaluable = rows.filter((r) => covered.has(r.problem_id as string));
  const vectors = await embedder.embed(evaluable.map((r) => r.hikoya as string));

  const stats = new Map<RetrievalMode, Map<string, Stat>>(MODES.map((m) => [m, new Map()]));
  const misses = new Map<RetrievalMode, { id: string; style: string; problemId: string; top: string[] }[]>(MODES.map((m) => [m, []]));
  const add = (mode: RetrievalMode, key: string, hit: boolean) => {
    const byKey = stats.get(mode) as Map<string, Stat>;
    const s = byKey.get(key) ?? { n: 0, hit: 0 };
    s.n++;
    if (hit) s.hit++;
    byKey.set(key, s);
  };

  evaluable.forEach((r, i) => {
    for (const mode of MODES) {
      const top = rankChunks(index, r.hikoya as string, vectors[i] as number[], k, mode);
      const hit = top.some((c) => c.problemIds.includes(r.problem_id as string));
      add(mode, "JAMI", hit);
      add(mode, r.uslub as string, hit);
      if (!hit) {
        (misses.get(mode) as { id: string; style: string; problemId: string; top: string[] }[]).push({
          id: r.id as string,
          style: r.uslub as string,
          problemId: r.problem_id as string,
          top: top.map((c) => `${c.code}/${c.article}`),
        });
      }
    }
  });

  const pct = (s: Stat) => Math.round((s.hit / s.n) * 1000) / 10;
  const dense = stats.get("dense") as Map<string, Stat>;
  const keys = ["JAMI", ...[...dense.keys()].filter((x) => x !== "JAMI").sort((a, b) => STYLE_ORDER.indexOf(a) - STYLE_ORDER.indexOf(b))];
  console.table(
    Object.fromEntries(
      keys.map((key) => [
        key,
        {
          Hikoyalar: dense.get(key)!.n,
          ...Object.fromEntries(MODES.map((m) => [`${m} r@${k}`, `${pct((stats.get(m) as Map<string, Stat>).get(key)!)}%`])),
        },
      ]),
    ),
  );
  console.log(`Baholanmadi (muammosi uchun modda yo'q): ${rows.length - evaluable.length} ta hikoya`);

  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((x) => String(x).padStart(2, "0")).join("-");
  const out = join(__dirname, "../eval/reports", `${date}-rag-recall.json`);
  mkdirSync(join(out, ".."), { recursive: true });
  const recall = (mode: RetrievalMode) =>
    Object.fromEntries(keys.map((key) => {
      const s = (stats.get(mode) as Map<string, Stat>).get(key)!;
      return [key, { n: s.n, hit: s.hit, recall: pct(s) }];
    }));
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        generatedAt: now.toISOString(),
        k,
        model: index.model,
        chunks: index.chunks.length,
        stories: rows.length,
        evaluated: evaluable.length,
        excluded: rows.length - evaluable.length,
        modes: Object.fromEntries(MODES.map((m) => [m, { recall: recall(m), misses: misses.get(m) }])),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Hisobot: ${out}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});

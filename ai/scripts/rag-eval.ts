/**
 * Retrieval recall@k on ai/eval/datasets/test_cases.csv (no LLM).
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
import { loadIndex, search } from "../rag/legal-index";

const STYLE_ORDER = ["rasmiy", "qisqa", "sheva", "aralash", "kirill"];

async function main(): Promise<void> {
  const k = Number(process.argv[2] ?? 5);
  const index = loadIndex();
  const embedder = await getEmbedder();
  if (embedder.id !== index.model) throw new Error(`index ${index.model} != embedder ${embedder.id}; run pnpm rag:index`);

  const covered = new Set(index.chunks.flatMap((c) => c.problemIds));
  const rows = parseCsv(readFileSync(join(__dirname, "../eval/datasets/test_cases.csv"), "utf8")).filter((r) => r.hikoya);
  const evaluable = rows.filter((r) => covered.has(r.problem_id as string));
  const vectors = await embedder.embed(evaluable.map((r) => r.hikoya as string));

  const stats = new Map<string, { n: number; hit: number }>();
  const add = (key: string, hit: boolean) => {
    const s = stats.get(key) ?? { n: 0, hit: 0 };
    s.n++;
    if (hit) s.hit++;
    stats.set(key, s);
  };
  const misses: { id: string; style: string; problemId: string; top: string[] }[] = [];
  evaluable.forEach((r, i) => {
    const top = search(index, vectors[i] as number[], k);
    const hit = top.some((c) => c.problemIds.includes(r.problem_id as string));
    add("JAMI", hit);
    add(r.uslub as string, hit);
    if (!hit) misses.push({ id: r.id as string, style: r.uslub as string, problemId: r.problem_id as string, top: top.map((c) => `${c.code}/${c.article}`) });
  });

  const pct = (s: { n: number; hit: number }) => Math.round((s.hit / s.n) * 1000) / 10;
  const keys = ["JAMI", ...[...stats.keys()].filter((x) => x !== "JAMI").sort((a, b) => STYLE_ORDER.indexOf(a) - STYLE_ORDER.indexOf(b))];
  console.table(Object.fromEntries(keys.map((key) => [key, { Hikoyalar: stats.get(key)!.n, [`recall@${k}`]: `${pct(stats.get(key)!)}%` }])));
  console.log(`Baholanmadi (muammosi uchun modda yo'q): ${rows.length - evaluable.length} ta hikoya`);

  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((x) => String(x).padStart(2, "0")).join("-");
  const out = join(__dirname, "../eval/reports", `${date}-rag-recall.json`);
  mkdirSync(join(out, ".."), { recursive: true });
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
        recall: Object.fromEntries(keys.map((key) => [key, { n: stats.get(key)!.n, hit: stats.get(key)!.hit, recall: pct(stats.get(key)!) }])),
        misses,
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

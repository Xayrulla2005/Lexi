/**
 * Builds the article index: legal-knowledge/articles/**.md -> chunks -> bge-m3 -> JSON.
 * Run: pnpm rag:index
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createEmbedder } from "../rag/embeddings";
import { buildIndex, INDEX_FILE, loadArticles, saveIndex } from "../rag/legal-index";

async function main(): Promise<void> {
  const t0 = Date.now();
  const articles = loadArticles();
  const embedder = await createEmbedder((m) => console.log(m));
  console.log(`embedder: ${embedder.id} (${Date.now() - t0} ms)`);
  const index = await buildIndex(embedder, articles);
  mkdirSync(dirname(INDEX_FILE), { recursive: true });
  saveIndex(index);
  const split = index.chunks.filter((c) => c.parts > 1).map((c) => `${c.code}/${c.article}`);
  console.log(
    `${articles.length} ta modda -> ${index.chunks.length} ta bo'lak (${new Set(split).size} ta modda bo'lingan), ` +
      `dim=${index.dim}, ${Date.now() - t0} ms -> ${INDEX_FILE}`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});

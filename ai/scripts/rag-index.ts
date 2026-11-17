/**
 * Builds the article index: legal-knowledge/articles/**.md -> chunks -> bge-m3 -> JSON.
 * Run: pnpm rag:index
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getEmbedder } from "../rag/embeddings";
import { buildIndex, INDEX_FILE, loadArticles, loadIndex, saveIndex } from "../rag/legal-index";

async function main(): Promise<void> {
  const t0 = Date.now();
  const articles = loadArticles();
  const embedder = await getEmbedder((m) => console.log(m));
  console.log(`embedder: ${embedder.id} (${Date.now() - t0} ms)`);
  // Reuse vectors of unchanged chunks unless --full is given.
  const previous = !process.argv.includes("--full") && existsSync(INDEX_FILE) ? loadIndex() : undefined;
  const { reused, ...index } = await buildIndex(embedder, articles, previous);
  mkdirSync(dirname(INDEX_FILE), { recursive: true });
  saveIndex(index);
  console.log(`qayta ishlatilgan vektorlar: ${reused}, yangi embed: ${index.chunks.length - reused}`);
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

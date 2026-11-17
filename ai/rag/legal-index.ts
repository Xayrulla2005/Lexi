/**
 * Article index for retrieval (no LLM).
 *
 * - Source: legal-knowledge/articles/<code>/<article>.md (verbatim lex.uz text, status DRAFT).
 * - Chunks: one article = one chunk; long articles are split on paragraph boundaries,
 *   every part keeps the "N-modda. Heading" line so it stays self-describing.
 * - Index: JSON file with L2-normalized bge-m3 vectors; search = cosine (dot product) in memory.
 *   Few chunks for now; pgvector later.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bm25For, rrf } from "./bm25";
import { getEmbedder, type Embedder } from "./embeddings";
import { repoRoot } from "./paths";

const ROOT = repoRoot();
export const ARTICLES_DIR = join(ROOT, "legal-knowledge/articles");
export const INDEX_FILE = join(ROOT, "legal-knowledge/index/articles.index.json");

/** Long articles are split into parts of at most this many characters (~600–900 tokens). */
export const MAX_CHUNK_CHARS = 2000;
const NOTES_MARKER = "<!-- lex.uz izohlari";

export interface ArticleFile {
  code: string;
  articleId: string;
  document: string;
  article: string;
  title: string;
  sourceUrl: string;
  retrievedAt: string;
  status: string;
  problemIds: string[];
  /** "N-modda. Heading" */
  headingLine: string;
  /** Article paragraphs (lex.uz notes excluded). */
  paragraphs: string[];
}

export interface Chunk {
  id: string;
  code: string;
  article: string;
  title: string;
  document: string;
  sourceUrl: string;
  status: string;
  problemIds: string[];
  /** Part number (1-based) and total parts of the article. */
  part: number;
  parts: number;
  text: string;
}

export interface IndexedChunk extends Chunk {
  vector: number[];
}

export interface LegalIndex {
  model: string;
  createdAt: string;
  dim: number;
  maxChunkChars: number;
  chunks: IndexedChunk[];
}

/** Our own frontmatter format (see scripts/rag-sources.ts): `key: <JSON string | bare value | [list]>`. */
function parseFrontmatter(src: string): { meta: Record<string, string | string[]>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(src.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("missing frontmatter");
  const meta: Record<string, string | string[]> = {};
  for (const line of (m[1] as string).split("\n")) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const raw = (kv[2] as string).trim();
    if (raw.startsWith("[")) meta[kv[1] as string] = raw.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    else meta[kv[1] as string] = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  }
  return { meta, body: m[2] as string };
}

export function readArticle(file: string, code: string): ArticleFile {
  const { meta, body } = parseFrontmatter(readFileSync(file, "utf8"));
  const text = body.split(NOTES_MARKER)[0] as string;
  const lines = text.trim().split("\n");
  const headingLine = (lines[0] ?? "").replace(/^#\s+/, "");
  const paragraphs = lines
    .slice(1)
    .join("\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : "");
  return {
    code,
    articleId: file.replace(/^.*[\\/]/, "").replace(/\.md$/, ""),
    document: str("document"),
    article: str("article"),
    title: str("title"),
    sourceUrl: str("source_url"),
    retrievedAt: str("retrieved_at"),
    status: str("status"),
    problemIds: Array.isArray(meta.problem_ids) ? meta.problem_ids : [],
    headingLine,
    paragraphs,
  };
}

export function loadArticles(dir: string = ARTICLES_DIR): ArticleFile[] {
  if (!existsSync(dir)) return [];
  const out: ArticleFile[] = [];
  for (const code of readdirSync(dir).sort()) {
    for (const f of readdirSync(join(dir, code)).filter((x) => x.endsWith(".md")).sort()) out.push(readArticle(join(dir, code, f), code));
  }
  return out;
}

/** One chunk per article; long articles split on paragraph boundaries (a single huge paragraph is split by sentences). */
export function chunkArticle(a: ArticleFile, maxChars: number = MAX_CHUNK_CHARS): Chunk[] {
  const pieces: string[] = [];
  const budget = maxChars - a.headingLine.length - 1;
  for (const p of a.paragraphs) {
    if (p.length <= budget) pieces.push(p);
    else {
      let buf = "";
      for (const s of p.split(/(?<=[.;:])\s+/)) {
        if (buf && buf.length + s.length + 1 > budget) {
          pieces.push(buf);
          buf = "";
        }
        buf = buf ? `${buf} ${s}` : s;
      }
      if (buf) pieces.push(buf);
    }
  }
  const groups: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const p of pieces) {
    if (cur.length && len + p.length + 1 > budget) {
      groups.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(p);
    len += p.length + 1;
  }
  if (cur.length) groups.push(cur);
  return groups.map((g, i) => ({
    id: `${a.code}/${a.articleId}#${i + 1}`,
    code: a.code,
    article: a.article,
    title: a.title,
    document: a.document,
    sourceUrl: a.sourceUrl,
    status: a.status,
    problemIds: a.problemIds,
    part: i + 1,
    parts: groups.length,
    text: `${a.headingLine}\n${g.join("\n")}`,
  }));
}

/**
 * Embeds the article chunks. With `previous` (same model), chunks whose id and text are
 * unchanged keep their vectors, so adding a few articles does not re-embed everything.
 */
export async function buildIndex(
  embedder: Embedder,
  articles: ArticleFile[] = loadArticles(),
  previous?: LegalIndex,
): Promise<LegalIndex & { reused: number }> {
  const chunks = articles.flatMap((a) => chunkArticle(a));
  const old = new Map(
    previous && previous.model === embedder.id ? previous.chunks.map((c) => [`${c.id}|${c.text}`, c.vector]) : [],
  );
  const todo = chunks.filter((c) => !old.has(`${c.id}|${c.text}`));
  const fresh = await embedder.embed(todo.map((c) => c.text));
  const byId = new Map(todo.map((c, i) => [c.id, (fresh[i] as number[]).map((x) => Math.round(x * 1e6) / 1e6)]));
  const indexed = chunks.map((c) => ({ ...c, vector: old.get(`${c.id}|${c.text}`) ?? (byId.get(c.id) as number[]) }));
  return {
    model: embedder.id,
    createdAt: new Date().toISOString(),
    dim: indexed[0]?.vector.length ?? 0,
    maxChunkChars: MAX_CHUNK_CHARS,
    chunks: indexed,
    reused: chunks.length - todo.length,
  };
}

export function saveIndex(index: LegalIndex, file: string = INDEX_FILE): void {
  writeFileSync(file, `${JSON.stringify(index)}\n`);
}

export function loadIndex(file: string = INDEX_FILE): LegalIndex {
  return JSON.parse(readFileSync(file, "utf8")) as LegalIndex;
}

export interface RetrievedChunk extends Chunk {
  score: number;
}

const dot = (a: readonly number[], b: readonly number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] as number) * (b[i] as number);
  return s;
};

/** Top-k chunks by cosine similarity (vectors are L2-normalized). */
export function search(index: LegalIndex, queryVector: readonly number[], k: number): RetrievedChunk[] {
  return index.chunks
    .map(({ vector, ...c }) => ({ ...c, score: dot(queryVector, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

let indexCache: { file: string; index: LegalIndex } | null = null;

/** The saved index, read from disk once per process (it is never rebuilt at query time). */
export function getIndex(file: string = INDEX_FILE): LegalIndex {
  if (!indexCache || indexCache.file !== file) indexCache = { file, index: loadIndex(file) };
  return indexCache.index;
}

/** Index + the matching embedder, both loaded once. */
async function ready(): Promise<{ index: LegalIndex; embedder: Embedder }> {
  const index = getIndex();
  const embedder = await getEmbedder();
  if (embedder.id !== index.model) {
    throw new Error(`Index was built with ${index.model}, but the current embedder is ${embedder.id}; run pnpm rag:index`);
  }
  return { index, embedder };
}

/**
 * Loads the index and the model and runs one dummy query, so the first real request
 * does not pay the model start-up cost. Returns the timings in ms.
 */
export async function warmUp(): Promise<{ loadMs: number; firstQueryMs: number }> {
  const t0 = performance.now();
  const { embedder } = await ready();
  const t1 = performance.now();
  await embedder.embed(["isitish"]);
  const t2 = performance.now();
  return { loadMs: Math.round(t1 - t0), firstQueryMs: Math.round(t2 - t1) };
}

/**
 * retrieve(query, k): embeds the query with the same model the index was built with
 * and returns the top-k article chunks (dense cosine search).
 */
export async function retrieve(query: string, k = 5, mode: RetrievalMode = defaultRetrievalMode()): Promise<RetrievedChunk[]> {
  const { index, embedder } = await ready();
  const [v] = await embedder.embed([query]);
  return rankChunks(index, query, v as number[], k, mode);
}

/**
 * dense  — bge-m3 cosine only (default);
 * bm25   — keywords only;
 * hybrid — BM25 + dense fused with RRF (opt-in via RAG_MODE=hybrid).
 */
export type RetrievalMode = "dense" | "bm25" | "hybrid";

export function defaultRetrievalMode(env: NodeJS.ProcessEnv = process.env): RetrievalMode {
  const m = env.RAG_MODE;
  return m === "hybrid" || m === "bm25" ? m : "dense";
}

/** Ranks chunks for an already-embedded query (shared by retrieve() and the eval). */
export function rankChunks(index: LegalIndex, query: string, queryVector: readonly number[], k: number, mode: RetrievalMode): RetrievedChunk[] {
  if (mode === "dense") return search(index, queryVector, k);
  const keyword = bm25For(index).rank(query);
  if (mode === "bm25") return keyword.slice(0, k);
  return rrf([search(index, queryVector, index.chunks.length), keyword], k);
}

/**
 * Retrieval for analysis. Main path = the catalog: when the problem type is known,
 * the articles the catalog cites for it are returned as-is (no semantic search).
 * RAG only adds extra candidates, clearly labelled.
 *
 *   problemId known -> catalog articles + up to 3 more distinct articles from RAG
 *   problemId null  -> RAG top-5 distinct articles
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARTICLES_DIR, readArticle, retrieve, type RetrievedChunk } from "./legal-index";
import { repoRoot } from "./paths";
import { adoptedOn } from "./source-metadata";

export const NEEDED_ARTICLES_FILE = join(repoRoot(), "legal-knowledge", "sources", "needed-articles.json");

/** Extra RAG articles on top of the catalog ones. */
export const RAG_EXTRA_K = 3;
/** RAG articles when the problem type is unknown. */
export const RAG_ONLY_K = 5;

export type ArticleSource = "catalog" | "rag";

export interface RetrievedArticle {
  /** "<code>/<articleId>", e.g. "mehnat_kodeksi/253". */
  key: string;
  code: string;
  /** As written in law: "253", "126¹". */
  article: string;
  title: string;
  document: string;
  sourceUrl: string;
  /** Always DRAFT until the legal reviewer verifies the text. */
  status: string;
  /** When the text was fetched from lex.uz (ISO), null if unknown. */
  retrievedAt: string | null;
  /** Document date from the lex.uz listing (yyyy-mm-dd), null if unknown. */
  adoptedOn: string | null;
  /** Article text (catalog) or the best-matching chunk text (rag). */
  text: string;
  source: ArticleSource;
  /** Retrieval score for rag hits; null for catalog articles. */
  score: number | null;
}

interface NeededFile {
  codes: { key: string; articles: { id: string; display: string; problemIds: string[] }[] }[];
}

let needed: NeededFile | null = null;
const loadNeeded = (): NeededFile => (needed ??= JSON.parse(readFileSync(NEEDED_ARTICLES_FILE, "utf8")) as NeededFile);

/** Catalog citations for a problem that have no fetched text (e.g. an excluded article). */
export function missingArticlesForProblem(problemId: string): string[] {
  const out: string[] = [];
  for (const c of loadNeeded().codes) {
    for (const a of c.articles) {
      if (a.problemIds.includes(problemId) && !existsSync(join(ARTICLES_DIR, c.key, `${a.id}.md`))) out.push(`${c.key}/${a.id}`);
    }
  }
  return out;
}

/**
 * Exactly the articles the catalog cites for this problem (needed-articles.json),
 * in catalog order, read from legal-knowledge/articles/. No semantic search.
 * Articles without a fetched text are skipped (see missingArticlesForProblem).
 */
export function getArticlesForProblem(problemId: string): RetrievedArticle[] {
  const out: RetrievedArticle[] = [];
  for (const c of loadNeeded().codes) {
    for (const a of c.articles) {
      if (!a.problemIds.includes(problemId)) continue;
      const file = join(ARTICLES_DIR, c.key, `${a.id}.md`);
      if (!existsSync(file)) continue;
      const art = readArticle(file, c.key);
      out.push({
        key: `${c.key}/${a.id}`,
        code: c.key,
        article: art.article,
        title: art.title,
        document: art.document,
        sourceUrl: art.sourceUrl,
        status: art.status,
        retrievedAt: art.retrievedAt || null,
        adoptedOn: adoptedOn(c.key),
        text: [art.headingLine, ...art.paragraphs].join("\n"),
        source: "catalog",
        score: null,
      });
    }
  }
  return out;
}

/** retrieved_at of an article file (RAG hits carry only the chunk), null if the file is missing. */
function retrievedAtOf(key: string): string | null {
  const [code, id] = key.split("/");
  const file = join(ARTICLES_DIR, code ?? "", `${id ?? ""}.md`);
  return existsSync(file) ? readArticle(file, code ?? "").retrievedAt || null : null;
}

/** Chunk -> article key ("mehnat_kodeksi/253" from "mehnat_kodeksi/253#2"). */
const chunkKey = (c: RetrievedChunk): string => c.id.split("#")[0] as string;

export type RagSearch = (query: string, k: number) => Promise<RetrievedChunk[]>;

/** Up to `k` distinct articles from RAG, skipping `exclude`. Asks for more chunks because articles can repeat. */
async function ragArticles(story: string, k: number, exclude: ReadonlySet<string>, rag: RagSearch): Promise<RetrievedArticle[]> {
  const chunks = await rag(story, k * 4 + exclude.size);
  const out: RetrievedArticle[] = [];
  const seen = new Set(exclude);
  for (const c of chunks) {
    const key = chunkKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      code: c.code,
      article: c.article,
      title: c.title,
      document: c.document,
      sourceUrl: c.sourceUrl,
      status: c.status,
      retrievedAt: retrievedAtOf(key),
      adoptedOn: adoptedOn(c.code),
      text: c.text,
      source: "rag",
      score: c.score,
    });
    if (out.length >= k) break;
  }
  return out;
}

/**
 * Articles for the analysis of one story.
 * `rag` is injectable for tests; production uses the index search (retrieve).
 */
export async function retrieveForAnalysis(
  story: string,
  problemId: string | null,
  rag: RagSearch = retrieve,
): Promise<RetrievedArticle[]> {
  if (problemId === null) return ragArticles(story, RAG_ONLY_K, new Set(), rag);
  const catalog = getArticlesForProblem(problemId);
  const extra = await ragArticles(story, RAG_EXTRA_K, new Set(catalog.map((a) => a.key)), rag);
  return [...catalog, ...extra];
}

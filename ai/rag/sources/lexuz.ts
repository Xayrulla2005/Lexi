/**
 * Polite lex.uz client and HTML parsers.
 *
 * - At least MIN_INTERVAL_MS between requests (default 2 s), strictly sequential.
 * - Every URL is downloaded at most once: responses are cached on disk
 *   (legal-knowledge/sources/cache/, git-ignored) and reused forever.
 * - Parsers only extract text; they never change wording. Superscript article
 *   indexes (<sup>1</sup>) are written as Unicode superscripts (126¹).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, type HTMLElement, type Node as HtmlNode, NodeType } from "node-html-parser";

export const LEXUZ = "https://lex.uz";
const USER_AGENT = "lex-dispatcher-research/0.1 (+legal reference indexing; low rate)";
const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

interface CacheEntry {
  url: string;
  file: string;
  fetchedAt: string;
  status: number;
}

export class LexUzClient {
  private lastRequest = 0;
  private readonly indexFile: string;
  private readonly index: Record<string, CacheEntry>;
  /** Network requests made by this instance (cache hits excluded). */
  requests = 0;

  constructor(
    private readonly cacheDir: string,
    private readonly minIntervalMs = 2000,
  ) {
    mkdirSync(cacheDir, { recursive: true });
    this.indexFile = join(cacheDir, "index.json");
    this.index = existsSync(this.indexFile)
      ? (JSON.parse(readFileSync(this.indexFile, "utf8")) as Record<string, CacheEntry>)
      : {};
  }

  /** Returns the page HTML, from cache when available. `path` starts with "/". */
  async get(path: string): Promise<{ html: string; url: string; fetchedAt: string; fromCache: boolean }> {
    const url = `${LEXUZ}${path}`;
    const cached = this.index[url];
    if (cached && existsSync(join(this.cacheDir, cached.file))) {
      return { html: readFileSync(join(this.cacheDir, cached.file), "utf8"), url, fetchedAt: cached.fetchedAt, fromCache: true };
    }
    const wait = this.lastRequest + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequest = Date.now();
    this.requests++;

    const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
    const html = await res.text();
    this.lastRequest = Date.now();
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);

    const file = `${createHash("sha1").update(url).digest("hex").slice(0, 16)}.html`;
    writeFileSync(join(this.cacheDir, file), html);
    const fetchedAt = new Date().toISOString();
    this.index[url] = { url, file, fetchedAt, status: res.status };
    writeFileSync(this.indexFile, JSON.stringify(this.index, null, 2));
    return { html, url, fetchedAt, fromCache: false };
  }
}

/** Normalizes Uzbek apostrophes and spacing for title comparison only (never for stored text). */
export function normalizeTitle(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/[ʻʼ‘’`'´]/g, "'")
    .replace(/[“”«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

export interface SearchResult {
  /** lex.uz document id as used in URLs ("-6257288" = Latin version). */
  id: string;
  title: string;
  /** status_code_y = in force. */
  inForce: boolean;
  /** Type, date and number, e.g. "Oʻzbekiston Respublikasining Qonuni, 13.11.2026 yildagi O‘RQ-1189-son". */
  badge: string;
}

export function parseSearch(html: string): { total: number | null; results: SearchResult[] } {
  const totalMatch = /(\d[\d\s]*)\s+hujjat topildi/.exec(html);
  const results: SearchResult[] = [];
  for (const row of html.matchAll(/<tr class="dd-table__main-item">([\s\S]*?)<\/tr>/g)) {
    const r = row[1] as string;
    const a = /href="\/uz\/docs\/(-?\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(r);
    if (!a) continue;
    results.push({
      id: a[1] as string,
      title: decodeEntities((a[2] as string).replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim(),
      inForce: /status_code_y/.test(r),
      badge: decodeEntities((/badge-nine">([^<]*)/.exec(r)?.[1] ?? "").trim()),
    });
  }
  return { total: totalMatch ? Number((totalMatch[1] as string).replace(/\s/g, "")) : null, results };
}

/**
 * Document <title> -> number, date and name, e.g.
 *   "28.10.2022. Oʻzbekiston Respublikasining Mehnat kodeksi"
 *   "O‘RQ-139-сон 07.01.2008. Bola huquqlarining kafolatlari toʻgʻrisida"
 */
export function parseDocumentTitle(html: string): { number: string | null; date: string | null; title: string } {
  const raw = decodeEntities(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const m = /^(?:(\S+-(?:son|сон))\s+)?(\d{2}\.\d{2}\.\d{4})\.?\s*(.*)$/.exec(raw);
  return m
    ? { number: m[1] ?? null, date: m[2] as string, title: (m[3] as string).trim() }
    : { number: null, date: null, title: raw };
}

export interface ParsedArticle {
  /** "253", "126-1" */
  id: string;
  /** "253", "126¹" */
  display: string;
  /** Heading after "N-modda.", e.g. "Ish haqini toʻlash muddatlari". */
  heading: string;
  /** lex.uz element id of the heading (anchor). */
  anchor: string;
  /** Article paragraphs (ACT_TEXT), verbatim. */
  paragraphs: string[];
  /** Editorial notes inside the article (amendment references, lex.uz comments). */
  notes: string[];
}

/** Inline HTML -> text: <sup>n</sup> -> superscript digits, <br> -> newline, tags removed. */
function inlineText(node: HtmlNode): string {
  if (node.nodeType === NodeType.TEXT_NODE) return decodeEntities(node.rawText);
  if (node.nodeType !== NodeType.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase();
  if (tag === "br") return "\n";
  const inner = el.childNodes.map(inlineText).join("");
  if (tag === "sup" && /^\d+$/.test(inner.trim())) {
    return inner
      .trim()
      .split("")
      .map((d) => SUPERSCRIPT_DIGITS[Number(d)])
      .join("");
  }
  if (tag === "tr") return `${inner}\n`;
  if (tag === "td" || tag === "th") return `${inner}\t`;
  if (tag === "p" || tag === "div") return `${inner}\n`;
  return inner;
}

const clean = (s: string): string =>
  s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \u00a0]{2,}/g, " ")
    .trim();

const ARTICLE_HEADING = /^(\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹]*)-modda\.?\s*([\s\S]*)$/;

/** Block classes seen on lex.uz pages and how they are used. */
/** FOOTNOTE is part of the official text ("* Bundan buyon matnda ..."), so it stays with the article. */
const TEXT_CLASSES = new Set(["ACT_TEXT", "BY_DEFAULT", "ACT_FORM", "TABLE_STD", "ACT_EMBEDDED", "FOOTNOTE"]);
const NOTE_CLASSES = new Set(["COMMENT", "COMMENTLEXUZ", "CHANGES_ORIGINS"]);
const SKIP_CLASSES = new Set(["INDEXES_ON_REF"]);
const BOUNDARY_CLASSES = new Set(["CLAUSE_DEFAULT", "TEXT_HEADER_DEFAULT", "ACT_TITLE", "ACT_TITLE_APPL"]);

export interface ParsedDocument {
  date: string | null;
  title: string;
  articles: Map<string, ParsedArticle>;
  /** Block classes that were neither text, note, skip nor boundary (for the report). */
  unknownClasses: Set<string>;
}

/** Splits a lex.uz document page into articles. */
export function parseDocument(html: string): ParsedDocument {
  const { date, title } = parseDocumentTitle(html);
  const root = parse(html, { blockTextElements: { script: false, style: false } });
  const articles = new Map<string, ParsedArticle>();
  const unknownClasses = new Set<string>();
  let current: ParsedArticle | null = null;

  for (const block of root.querySelectorAll("div.lx_elem, div.lx_no_select")) {
    const cls = (block.getAttribute("class") ?? "").split(/\s+/).find((c) => /^[A-Z_]+$/.test(c)) ?? "";
    if (SKIP_CLASSES.has(cls)) continue;
    // The text lives in the child <div id=".." name="..">; lx_elem2/lx_elem3 hold UI buttons.
    const content = block.childNodes.find(
      (n): n is HTMLElement => n.nodeType === NodeType.ELEMENT_NODE && (n as HTMLElement).hasAttribute("name"),
    );
    const text = content ? clean(inlineText(content)) : "";

    if (BOUNDARY_CLASSES.has(cls)) {
      const m = cls === "CLAUSE_DEFAULT" ? ARTICLE_HEADING.exec(text) : null;
      if (m) {
        const index = (m[2] ?? "")
          .split("")
          .map((c) => SUPERSCRIPT_DIGITS.indexOf(c))
          .join("");
        const id = index ? `${m[1]}-${Number(index)}` : (m[1] as string);
        current = {
          id,
          display: `${m[1]}${m[2] ?? ""}`,
          heading: (m[3] as string).trim(),
          anchor: content?.getAttribute("id") ?? "",
          paragraphs: [],
          notes: [],
        };
        // First occurrence wins (a later duplicate would be a quoted/annexed text).
        if (!articles.has(id)) articles.set(id, current);
        else current = null;
      } else {
        current = null;
      }
      continue;
    }
    if (!current || !text) continue;
    if (TEXT_CLASSES.has(cls)) current.paragraphs.push(text);
    else if (NOTE_CLASSES.has(cls)) current.notes.push(text);
    else unknownClasses.add(cls || "(none)");
  }
  return { date, title, articles, unknownClasses };
}

/**
 * lex.uz keeps a note where an article was excluded, e.g.
 * "(272-modda Oʻzbekiston Respublikasining 1999-yil 20-avgustdagi 832-I-son Qonuniga asosan chiqarilgan)".
 */
export function findExclusionNote(html: string, display: string): string | null {
  const escaped = display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // "(N-modda ... )" possibly containing one level of nested parentheses.
  const re = new RegExp(`\\(${escaped}-modda [^()]*?(?:\\([^()]*\\)[^()]*?)*\\)`);
  const text = decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ");
  return re.exec(text)?.[0] ?? null;
}

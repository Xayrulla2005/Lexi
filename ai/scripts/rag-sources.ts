/**
 * Legal sources for RAG (no LLM). Commands:
 *   needed   — parse catalog `qonunlar` -> legal-knowledge/sources/needed-articles.json
 *   resolve  — find each code/law on lex.uz, open the page and verify its title
 *              -> legal-knowledge/sources/documents.json (with an `unresolved` list)
 *   fetch    — download each resolved code once (cached), cut out the needed articles
 *              -> legal-knowledge/articles/<code>/<article>.md + sources/fetch-report.json
 *
 * Run: pnpm rag:sources <command>. lex.uz: >= 2 s between requests, every page cached.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CODES, parseCitation, type CodeKey } from "../rag/sources/law-refs";
import {
  LEXUZ,
  LexUzClient,
  findExclusionNote,
  normalizeTitle,
  parseDocument,
  parseDocumentTitle,
  parseSearch,
  type SearchResult,
} from "../rag/sources/lexuz";

const ROOT = resolve(__dirname, "../..");
const CATALOG = join(ROOT, "legal-knowledge/catalog/problems.json");
const SOURCES = join(ROOT, "legal-knowledge/sources");
const ARTICLES = join(ROOT, "legal-knowledge/articles");
const NEEDED_FILE = join(SOURCES, "needed-articles.json");
const DOCUMENTS_FILE = join(SOURCES, "documents.json");
const FETCH_REPORT = join(SOURCES, "fetch-report.json");

interface CatalogProblem {
  id: string;
  qonunlar: string[];
}

interface NeededArticle {
  id: string;
  display: string;
  problemIds: string[];
  citations: string[];
}
interface NeededCode {
  key: CodeKey;
  name: string;
  articles: NeededArticle[];
}
interface CitationWithoutArticle {
  citation: string;
  document: string;
  codeKey: CodeKey | null;
  problemIds: string[];
  note: string | null;
}
interface NeededFile {
  generatedAt: string;
  source: string;
  codes: NeededCode[];
  withoutArticles: CitationWithoutArticle[];
}

const writeJson = (file: string, data: unknown): void => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const today = (): string => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------------------------
// 1. needed
// ---------------------------------------------------------------------------------------------
function needed(): NeededFile {
  const catalog = readJson<{ muammolar: CatalogProblem[] }>(CATALOG);
  const codes = new Map<CodeKey, Map<string, NeededArticle>>();
  const without = new Map<string, CitationWithoutArticle>();

  for (const p of catalog.muammolar) {
    for (const citation of p.qonunlar) {
      const parsed = parseCitation(citation);
      if (parsed.codeKey && parsed.articles.length) {
        const articles = codes.get(parsed.codeKey) ?? new Map<string, NeededArticle>();
        codes.set(parsed.codeKey, articles);
        for (const a of parsed.articles) {
          const entry = articles.get(a.id) ?? { id: a.id, display: a.display, problemIds: [], citations: [] };
          if (!entry.problemIds.includes(p.id)) entry.problemIds.push(p.id);
          if (!entry.citations.includes(citation)) entry.citations.push(citation);
          articles.set(a.id, entry);
        }
      } else {
        const entry = without.get(citation) ?? {
          citation,
          document: parsed.document,
          codeKey: parsed.codeKey,
          problemIds: [],
          note: parsed.note,
        };
        if (!entry.problemIds.includes(p.id)) entry.problemIds.push(p.id);
        without.set(citation, entry);
      }
    }
  }

  const byNumber = (a: NeededArticle, b: NeededArticle) => {
    const [ab, ai = "0"] = a.id.split("-");
    const [bb, bi = "0"] = b.id.split("-");
    return Number(ab) - Number(bb) || Number(ai) - Number(bi);
  };
  const out: NeededFile = {
    generatedAt: new Date().toISOString(),
    source: "legal-knowledge/catalog/problems.json (qonunlar)",
    codes: CODES.filter((c) => codes.has(c.key)).map((c) => ({
      key: c.key,
      name: c.name,
      articles: [...(codes.get(c.key) as Map<string, NeededArticle>).values()].sort(byNumber),
    })),
    withoutArticles: [...without.values()].sort((a, b) => a.citation.localeCompare(b.citation)),
  };
  writeJson(NEEDED_FILE, out);
  const total = out.codes.reduce((n, c) => n + c.articles.length, 0);
  console.log(`needed-articles.json: ${total} ta modda, ${out.codes.length} ta kodeks; moddasiz yozuvlar: ${out.withoutArticles.length}`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// 2. resolve
// ---------------------------------------------------------------------------------------------
interface ResolvedDocument {
  name: string;
  kind: "code" | "law";
  codeKey: CodeKey | null;
  /** One entry per lex.uz document (the Civil Code has several parts). */
  parts: { lexuzId: string; url: string; title: string; date: string | null; number: string | null; badge: string }[];
  verifiedAt: string;
  problemIds: string[];
}
interface UnresolvedDocument {
  name: string;
  problemIds: string[];
  reason: string;
  candidates: { title: string; url: string; inForce: boolean; badge: string }[];
}
interface DocumentsFile {
  verifiedAt: string;
  method: string;
  documents: ResolvedDocument[];
  unresolved: UnresolvedDocument[];
}

/** Catalog spelling -> official orthography for the search box: oʻ/gʻ use ʻ, other apostrophes ʼ. */
const officialApostrophes = (s: string): string => s.replace(/([OoGg])'/g, "$1ʻ").replace(/'/g, "ʼ");

/** Catalog entries that name a group of acts or a foreign law, not one lex.uz document. */
const NOT_A_SINGLE_DOCUMENT = /normativ hujjatlar|qoidalari|davlat qonunchiligi|tartibi \(Vazirlar Mahkamasi qarori\)/;

interface Target {
  name: string;
  kind: "code" | "law";
  codeKey: CodeKey | null;
  problemIds: string[];
  query: string;
  /** Accepts a normalized search-result title. */
  matches: (normalizedTitle: string) => boolean;
  /** Expected normalized page title prefix check. */
  expectedTitle: string;
}

function targets(n: NeededFile): { targets: Target[]; unresolved: UnresolvedDocument[] } {
  const docs = new Map<string, { kind: "code" | "law"; codeKey: CodeKey | null; problemIds: Set<string> }>();
  const add = (name: string, kind: "code" | "law", codeKey: CodeKey | null, ids: string[]) => {
    const d = docs.get(name) ?? { kind, codeKey, problemIds: new Set<string>() };
    ids.forEach((id) => d.problemIds.add(id));
    docs.set(name, d);
  };
  for (const c of n.codes) add(c.name, "code", c.key, c.articles.flatMap((a) => a.problemIds));
  for (const w of n.withoutArticles) {
    if (w.codeKey) add(CODES.find((c) => c.key === w.codeKey)?.name as string, "code", w.codeKey, w.problemIds);
    else add(w.document, "law", null, w.problemIds);
  }

  const out: Target[] = [];
  const unresolved: UnresolvedDocument[] = [];
  for (const [name, d] of docs) {
    const problemIds = [...d.problemIds].sort();
    if (d.kind === "law" && (NOT_A_SINGLE_DOCUMENT.test(name) || !/ to'g'risidagi qonun$/.test(name))) {
      unresolved.push({ name, problemIds, reason: "Katalogda aniq bitta hujjat ko'rsatilmagan (umumiy havola)", candidates: [] });
      continue;
    }
    if (d.kind === "code") {
      const official = normalizeTitle(`O'zbekiston Respublikasining ${name.replace(/ kodeks$/, " kodeksi")}`);
      out.push({
        name,
        kind: "code",
        codeKey: d.codeKey,
        problemIds,
        query: officialApostrophes(name.replace(/ kodeks$/, " kodeksi")),
        matches: (t) => t === official || new RegExp(`^${escapeRe(official)} \\((birinchi|ikkinchi|uchinchi) qism\\)$`).test(t),
        expectedTitle: official,
      });
    } else {
      const title = name.replace(/ to'g'risidagi qonun$/, " to'g'risida");
      const official = normalizeTitle(title);
      out.push({ name, kind: "law", codeKey: null, problemIds, query: officialApostrophes(title), matches: (t) => t === official, expectedTitle: official });
    }
  }
  return { targets: out, unresolved };
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function resolveDocuments(client: LexUzClient): Promise<DocumentsFile> {
  const n = existsSync(NEEDED_FILE) ? readJson<NeededFile>(NEEDED_FILE) : needed();
  const { targets: list, unresolved } = targets(n);
  const documents: ResolvedDocument[] = [];

  for (const t of list) {
    const actType = t.kind === "code" ? 21 : 22;
    const isHit = (r: SearchResult) => r.inForce && t.matches(normalizeTitle(r.title)) && (t.kind === "code" || /qonuni/i.test(r.badge));
    // Query 1: official spelling. Query 2 (only if needed): the words without apostrophes, because the
    // search is apostrophe-sensitive. Either way a hit must match the expected title exactly.
    const queries = [t.query, t.query.split(" ").filter((w) => !/[ʻʼ']/.test(w)).join(" ")];
    let results: SearchResult[] = [];
    let hits: SearchResult[] = [];
    for (const q of [...new Set(queries)].filter((q) => q.length >= 3)) {
      const { html } = await client.get(`/uz/search/all?act_type=${actType}&searchtitle=${encodeURIComponent(q)}`);
      const found = parseSearch(html).results;
      results = results.concat(found.filter((r) => !results.some((x) => x.id === r.id)));
      hits = results.filter(isHit);
      if (hits.length) break;
    }
    const candidates = (rs: SearchResult[]) =>
      rs.slice(0, 5).map((r) => ({ title: r.title, url: `${LEXUZ}/uz/docs/${r.id}`, inForce: r.inForce, badge: r.badge }));

    if (!hits.length || (t.kind === "law" && hits.length > 1)) {
      unresolved.push({
        name: t.name,
        problemIds: t.problemIds,
        reason: hits.length ? "Bir nechta mos hujjat topildi" : "Qidiruvda aniq mos, amaldagi hujjat topilmadi",
        candidates: candidates(hits.length ? hits : results),
      });
      console.log(`✗ ${t.name}: ${hits.length ? "bir nechta" : "topilmadi"}`);
      continue;
    }

    // Open every hit (Latin version: negative id) and verify the page title.
    const parts: ResolvedDocument["parts"] = [];
    let failed: string | null = null;
    for (const h of hits) {
      const latinId = h.id.startsWith("-") ? h.id : `-${h.id}`;
      const page = await client.get(`/uz/docs/${latinId}`);
      const { number, date, title } = parseDocumentTitle(page.html.slice(0, 20_000));
      if (!t.matches(normalizeTitle(title))) {
        failed = `Sahifa sarlavhasi mos emas: "${title}"`;
        break;
      }
      parts.push({ lexuzId: latinId, url: `${LEXUZ}/uz/docs/${latinId}`, title, date, number, badge: h.badge });
    }
    if (failed) {
      unresolved.push({ name: t.name, problemIds: t.problemIds, reason: failed, candidates: candidates(hits) });
      console.log(`✗ ${t.name}: ${failed}`);
      continue;
    }
    documents.push({ name: t.name, kind: t.kind, codeKey: t.codeKey, parts, verifiedAt: today(), problemIds: t.problemIds });
    console.log(`✓ ${t.name}: ${parts.map((p) => `${p.title} (${p.url})`).join("; ")}`);
  }

  const out: DocumentsFile = {
    verifiedAt: today(),
    method:
      "lex.uz qidiruvi (act_type 21 = kodekslar, 22 = qonunlar), faqat amaldagi va sarlavhasi aynan mos hujjat; " +
      "keyin hujjat sahifasi (lotin) ochilib, <title> tekshirilgan.",
    documents,
    unresolved,
  };
  writeJson(DOCUMENTS_FILE, out);
  console.log(`documents.json: ${documents.length} ta hujjat, unresolved: ${unresolved.length}; lex.uz so'rovlari: ${client.requests}`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// 3. fetch
// ---------------------------------------------------------------------------------------------
interface FetchReport {
  retrievedAt: string;
  found: number;
  missing: { code: CodeKey; article: string; problemIds: string[]; reason: string }[];
  /** Superscript articles: checked that "N<sup>k</sup>-modda" was matched, not article N. */
  superscriptChecks: { code: CodeKey; article: string; found: boolean; heading: string | null; baseHeading: string | null }[];
  /** Found articles whose heading or text says they were repealed/excluded. */
  repealed: { code: CodeKey; article: string; heading: string }[];
  /** Article number present in more than one part of a code (first part in order is used). */
  ambiguous: { code: CodeKey; article: string; parts: string[] }[];
  unknownBlockClasses: string[];
  requests: number;
}

const yaml = (s: string): string => JSON.stringify(s);
const PART_ORDER = ["birinchi", "ikkinchi", "uchinchi"];
const partOrder = (title: string): number => {
  const i = PART_ORDER.findIndex((w) => title.includes(`(${w} qism)`));
  return i < 0 ? 0 : i;
};

function articleMarkdown(p: {
  document: string;
  codeKey: CodeKey;
  display: string;
  heading: string;
  url: string;
  retrievedAt: string;
  problemIds: string[];
  paragraphs: string[];
  notes: string[];
}): string {
  const front = [
    "---",
    `document: ${yaml(p.document)}`,
    `document_key: ${p.codeKey}`,
    `article: ${yaml(p.display)}`,
    `title: ${yaml(p.heading)}`,
    `source_url: ${yaml(p.url)}`,
    `retrieved_at: ${yaml(p.retrievedAt)}`,
    "status: DRAFT",
    `problem_ids: [${p.problemIds.join(", ")}]`,
    "---",
    "",
    `# ${p.display}-modda. ${p.heading}`,
    "",
    ...p.paragraphs.flatMap((t) => [t, ""]),
  ];
  if (p.notes.length) front.push("<!-- lex.uz izohlari (modda matni emas) -->", "", ...p.notes.flatMap((t) => [`> ${t.replace(/\n/g, "\n> ")}`, ""]));
  return `${front.join("\n").trimEnd()}\n`;
}

async function fetchArticles(client: LexUzClient): Promise<FetchReport> {
  const n = readJson<NeededFile>(NEEDED_FILE);
  const docs = readJson<DocumentsFile>(DOCUMENTS_FILE);
  const report: FetchReport = {
    retrievedAt: new Date().toISOString(),
    found: 0,
    missing: [],
    superscriptChecks: [],
    repealed: [],
    ambiguous: [],
    unknownBlockClasses: [],
    requests: 0,
  };
  const unknown = new Set<string>();
  rmSync(ARTICLES, { recursive: true, force: true });

  for (const code of n.codes) {
    const doc = docs.documents.find((d) => d.codeKey === code.key);
    if (!doc) {
      for (const a of code.articles) report.missing.push({ code: code.key, article: a.display, problemIds: a.problemIds, reason: "Hujjat lex.uz'da aniqlanmagan (unresolved)" });
      continue;
    }
    // Parse every part once; an article number is looked up across the parts in order.
    const parts = [];
    // "(birinchi qism)" before "(ikkinchi qism)" so lookups are deterministic.
    const ordered = [...doc.parts].sort((a, b) => partOrder(a.title) - partOrder(b.title));
    for (const part of ordered) {
      const page = await client.get(`/uz/docs/${part.lexuzId}`);
      const parsed = parseDocument(page.html);
      parsed.unknownClasses.forEach((c) => unknown.add(c));
      parts.push({ part, parsed, fetchedAt: page.fetchedAt, html: page.html });
    }
    for (const a of code.articles) {
      const holders = parts.filter((p) => p.parsed.articles.has(a.id));
      if (holders.length > 1) report.ambiguous.push({ code: code.key, article: a.display, parts: holders.map((h) => h.part.title) });
      const hit = holders[0];
      const article = hit?.parsed.articles.get(a.id);
      if (a.id.includes("-")) {
        const base = parts.map((p) => p.parsed.articles.get(a.id.split("-")[0] as string)).find(Boolean);
        report.superscriptChecks.push({
          code: code.key,
          article: a.display,
          found: !!article && article.display === a.display,
          heading: article?.heading ?? null,
          baseHeading: base?.heading ?? null,
        });
      }
      if (!hit || !article) {
        const note = parts.map((p) => findExclusionNote(p.html, a.display)).find(Boolean);
        report.missing.push({
          code: code.key,
          article: a.display,
          problemIds: a.problemIds,
          reason: note ? `Matni yo'q; lex.uz izohi: ${note}` : "Hujjatda bunday raqamli modda topilmadi",
        });
        continue;
      }
      if (!article.paragraphs.length) {
        report.missing.push({ code: code.key, article: a.display, problemIds: a.problemIds, reason: `Modda sarlavhasi bor, matni yo'q: "${article.heading}"` });
        continue;
      }
      if (/chiqarib tashlangan|kuchini yoʻqotgan|kuchini yo'qotgan/i.test(`${article.heading} ${article.paragraphs.join(" ")}`.slice(0, 300))) {
        report.repealed.push({ code: code.key, article: a.display, heading: article.heading });
      }
      const file = join(ARTICLES, code.key, `${a.id}.md`);
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(
        file,
        articleMarkdown({
          document: hit.part.title,
          codeKey: code.key,
          display: article.display,
          heading: article.heading,
          url: `${hit.part.url}#${article.anchor}`,
          retrievedAt: hit.fetchedAt,
          problemIds: a.problemIds,
          paragraphs: article.paragraphs,
          notes: article.notes,
        }),
      );
      report.found++;
    }
  }
  report.unknownBlockClasses = [...unknown];
  report.requests = client.requests;
  writeJson(FETCH_REPORT, report);
  console.log(`moddalar: ${report.found} ta yozildi, ${report.missing.length} ta topilmadi; lex.uz so'rovlari: ${client.requests}`);
  for (const m of report.missing) console.log(`  ✗ ${m.code} ${m.article}: ${m.reason}`);
  for (const s of report.superscriptChecks) console.log(`  ${s.found ? "✓" : "✗"} ${s.code} ${s.article}: ${s.heading ?? "-"}  (asosiy: ${s.baseHeading ?? "-"})`);
  return report;
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const client = new LexUzClient(join(SOURCES, "cache"));
  if (cmd === "needed") needed();
  else if (cmd === "resolve") await resolveDocuments(client);
  else if (cmd === "fetch") await fetchArticles(client);
  else {
    console.error("Usage: rag:sources needed|resolve|fetch");
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});

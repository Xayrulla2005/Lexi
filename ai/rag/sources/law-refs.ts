/**
 * Parses catalog citations (`qonunlar`) such as
 *   "Mehnat kodeksi 253-modda", "Jinoyat kodeksi 168, 169, 278¹-moddalar",
 *   "Oila kodeksi 23–28-moddalar", "Iste'molchilarning ... to'g'risidagi qonun"
 * into documents and article numbers. Nothing is invented: a citation without an
 * article number is reported as such.
 */

const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** The five codes the catalog cites by article. Keys are used as folder names under legal-knowledge/articles/. */
export const CODES = [
  { key: "mehnat_kodeksi", name: "Mehnat kodeksi", pattern: /^Mehnat kodeksi\b/ },
  { key: "jinoyat_kodeksi", name: "Jinoyat kodeksi", pattern: /^Jinoyat kodeksi\b/ },
  { key: "fuqarolik_kodeksi", name: "Fuqarolik kodeksi", pattern: /^Fuqarolik kodeksi\b/ },
  {
    key: "mamuriy_javobgarlik_kodeksi",
    name: "Ma'muriy javobgarlik to'g'risidagi kodeks",
    pattern: /^Ma'muriy javobgarlik to'g'risidagi kodeks\b/,
  },
  { key: "oila_kodeksi", name: "Oila kodeksi", pattern: /^Oila kodeksi\b/ },
] as const;

export type CodeKey = (typeof CODES)[number]["key"];

export interface ArticleNumber {
  /** File-safe id: "253", "126-1" (126¹), "47-4" (47⁴). */
  id: string;
  /** As written in law: "253", "126¹". */
  display: string;
  /** Base number and superscript index (0 when none). */
  base: number;
  index: number;
}

export interface ParsedCitation {
  citation: string;
  /** Document name without article part and trailing notes. */
  document: string;
  codeKey: CodeKey | null;
  articles: ArticleNumber[];
  /** Text in parentheses or after a dash, e.g. "(kechiktirish uchun kompensatsiya)". */
  note: string | null;
}

const toSuperscript = (n: number): string =>
  String(n)
    .split("")
    .map((d) => SUPERSCRIPT_DIGITS[Number(d)])
    .join("");

export function articleNumber(base: number, index = 0): ArticleNumber {
  return {
    id: index ? `${base}-${index}` : String(base),
    display: index ? `${base}${toSuperscript(index)}` : String(base),
    base,
    index,
  };
}

/** "278¹" -> {278, 1}; "253" -> {253, 0}. */
function parseOne(token: string): ArticleNumber | null {
  const m = /^(\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹]*)$/.exec(token.trim());
  if (!m) return null;
  const sup = (m[2] ?? "")
    .split("")
    .map((c) => SUPERSCRIPT_DIGITS.indexOf(c))
    .join("");
  return articleNumber(Number(m[1]), sup ? Number(sup) : 0);
}

/** "23–28" (en dash or hyphen) -> 23..28; ranges never contain superscript articles. */
function parseList(list: string): ArticleNumber[] | null {
  const out: ArticleNumber[] = [];
  for (const part of list.split(",").map((p) => p.trim()).filter(Boolean)) {
    const range = /^(\d+)\s*[–-]\s*(\d+)$/.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to < from || to - from > 50) return null;
      for (let n = from; n <= to; n++) out.push(articleNumber(n));
      continue;
    }
    const one = parseOne(part);
    if (!one) return null;
    out.push(one);
  }
  return out.length ? out : null;
}

/** Article list right before "-modda" / "-moddalar". */
const ARTICLES = /\s+([\d⁰¹²³⁴⁵⁶⁷⁸⁹,\s–-]+?)-moddal?a?r?\b/;

export function parseCitation(citation: string): ParsedCitation {
  const text = citation.replace(/\s+/g, " ").trim();
  const code = CODES.find((c) => c.pattern.test(text)) ?? null;
  const noteMatch = /\s*(\(.*\)|—.*)$/.exec(text);
  const note = noteMatch ? noteMatch[1]!.replace(/^—\s*/, "").trim() : null;
  const head = noteMatch ? text.slice(0, noteMatch.index).trim() : text;

  const m = ARTICLES.exec(head);
  const articles = m ? parseList(m[1] as string) : null;
  const document = code ? code.name : (m ? head.slice(0, m.index) : head).trim();
  return { citation, document, codeKey: code?.key ?? null, articles: articles ?? [], note };
}

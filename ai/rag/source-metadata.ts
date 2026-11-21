/**
 * Source metadata and grounding flags for retrieved legal articles.
 *
 * Available in the repository (and nothing more is claimed):
 *   - document name, article, title, lex.uz URL, review status (article frontmatter);
 *   - retrievedAt: when the text was fetched from lex.uz (frontmatter `retrieved_at`);
 *   - adoptedOn: the document date shown in the lex.uz listing (legal-knowledge/sources/documents.json).
 * NOT available: issuer as a separate field, publication and effective dates, amendment history.
 * They stay null — never inferred or invented.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./paths";

/** Article text older than this (since retrieval from lex.uz) is flagged as possibly outdated. */
export const STALE_AFTER_DAYS = 180;
const DAY_MS = 24 * 3600 * 1000;

interface DocumentsFile {
  documents: { codeKey?: string; parts?: { date?: string }[] }[];
}

let adopted: Map<string, string> | null = null;

/** "dd.mm.yyyy" -> "yyyy-mm-dd"; null if not that shape. */
export function isoDate(ddmmyyyy: string | undefined): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ddmmyyyy ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** The document date from the lex.uz listing for a code key (first part), or null. */
export function adoptedOn(codeKey: string): string | null {
  if (!adopted) {
    adopted = new Map();
    const file = join(repoRoot(), "legal-knowledge", "sources", "documents.json");
    if (existsSync(file)) {
      const data = JSON.parse(readFileSync(file, "utf8")) as DocumentsFile;
      for (const d of data.documents) {
        const date = isoDate(d.parts?.[0]?.date);
        if (d.codeKey && date) adopted.set(d.codeKey, date);
      }
    }
  }
  return adopted.get(codeKey) ?? null;
}

export function isStale(retrievedAt: string | null, now = Date.now()): boolean {
  if (!retrievedAt) return true; // unknown age: treat as possibly outdated
  const t = Date.parse(retrievedAt);
  return !Number.isFinite(t) || now - t > STALE_AFTER_DAYS * DAY_MS;
}

export interface GroundingFlags {
  /** At least one source is not lawyer-verified (status other than VERIFIED). */
  unverified: boolean;
  /** At least one source text may be outdated. */
  stale: boolean;
  /** Oldest retrieval date among the sources (yyyy-mm-dd), for "as of" wording. */
  asOf: string | null;
}

export function groundingFlags(
  articles: readonly { status: string; retrievedAt: string | null }[],
  now = Date.now(),
): GroundingFlags {
  const dates = articles.map((a) => a.retrievedAt).filter((d): d is string => !!d).sort();
  return {
    unverified: articles.some((a) => a.status !== "VERIFIED"),
    stale: articles.some((a) => isStale(a.retrievedAt, now)),
    asOf: dates[0]?.slice(0, 10) ?? null,
  };
}

/**
 * Retrieved law text goes into prompts as DATA. Lines that imitate our prompt structure
 * (article headings "### key —", block delimiters) are neutralized so a source text cannot
 * pose as another article or close the data block; control characters are removed.
 */
export function sanitizeSourceText(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/<<<|>>>/g, "«»")
      .replace(/^\s*#{1,6}\s*/gm, "")
  );
}

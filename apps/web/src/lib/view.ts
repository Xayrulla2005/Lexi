/**
 * XAYRULLA: maps API contract values to the UI's existing keys, so the
 * teammate-owned files (content/texts.uz.ts, components/ui) stay unchanged.
 */
import type { RiskLevel, RoutingDecision, SubmissionStatus } from "@lex/contracts";

export type RiskTone = "red" | "orange" | "yellow" | "green";
export type RouteKind = "emergency" | "verified" | "generic";

/** Contract risk levels now equal the UI tone keys; kept explicit so a contract change fails typecheck here. */
const RISK_TONE: Record<RiskLevel, RiskTone> = {
  red: "red",
  orange: "orange",
  yellow: "yellow",
  green: "green",
};

export const riskTone = (level: RiskLevel): RiskTone => RISK_TONE[level];

/**
 * Label of the route kind, or null when no label is shown.
 * "generic" only for the fallback route (no problemId); an unverified catalog route
 * shows no label — its review notice already says it is not verified.
 * "verified" is shown only when the engine says no human review is needed.
 */
export function routeKind(decision: RoutingDecision): RouteKind | null {
  if (decision.routeType === "EMERGENCY") return "emergency";
  if (decision.routeType === "FALLBACK" || decision.problemId === null) return "generic";
  return decision.requiresHumanReview ? null : "verified";
}

export const statusKey = (status: SubmissionStatus): string => status.toLowerCase();

/** One dialable part of a catalog phone field such as "1176; +998 71 200-06-00 (ishonch)". */
export interface PhonePart {
  label: string;
  /** tel: URI, or null when the part has no digits. */
  href: string | null;
}

/** Splits a catalog phone field on ";" and builds tel: links. The text itself is shown unchanged. */
export function phoneParts(phone: string): PhonePart[] {
  return phone
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((label) => {
      const digits = label.replace(/\(.*?\)/g, "").replace(/[^\d+]/g, "");
      return { label, href: digits ? `tel:${digits}` : null };
    });
}

/** Catalog links are either URLs or app names ("Mening inspektorim ilovasi"). */
export const isUrl = (link: string): boolean => /^https?:\/\//.test(link);

/** Law names to show: catalog route laws first, then AI citations, without duplicates. */
export function lawNames(decision: RoutingDecision, analysisRefs: readonly { documentName: string; article: string | null }[]): string[] {
  const names = [...decision.legalReferences, ...analysisRefs].map((r) =>
    r.article ? `${r.documentName}, ${r.article}` : r.documentName,
  );
  return [...new Set(names)];
}

/** A piece of the application text: plain template text, or a field (null value = not filled in). */
export type TemplatePart = { kind: "text"; text: string } | { kind: "field"; key: string; value: string | null };

/** Splits a template into text and fields so empty fields can be highlighted. The template text is not changed. */
export function templateParts(template: string, fields: readonly { key: string; value: string | null }[]): TemplatePart[] {
  const values = new Map(fields.map((f) => [f.key, f.value]));
  const parts: TemplatePart[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{\{([a-z0-9_]+)\}\}/g)) {
    const key = m[1] as string;
    if (m.index > last) parts.push({ kind: "text", text: template.slice(last, m.index) });
    parts.push({ kind: "field", key, value: values.get(key) ?? null });
    last = m.index + m[0].length;
  }
  if (last < template.length) parts.push({ kind: "text", text: template.slice(last) });
  return parts;
}

/** Human-readable field label: "malumot_1" -> "malumot 1". */
export const fieldLabel = (key: string): string => key.replace(/_/g, " ");

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

/** "verified" is shown only when the engine says no human review is needed. */
export function routeKind(decision: RoutingDecision): RouteKind {
  if (decision.routeType === "EMERGENCY") return "emergency";
  return decision.routeType === "RULE_BASED" && !decision.requiresHumanReview ? "verified" : "generic";
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

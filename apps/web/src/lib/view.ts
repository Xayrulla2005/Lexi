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

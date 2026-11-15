import { z } from "zod";
import { Slug } from "./common";

/**
 * EMERGENCY  — immediate-danger escalation; always takes precedence.
 * RULE_BASED — a deterministic rule in packages/legal-engine matched.
 * FALLBACK   — no rule matched; generic advice + human review.
 */
export const RouteType = z.enum(["EMERGENCY", "RULE_BASED", "FALLBACK"]);
export type RouteType = z.infer<typeof RouteType>;

export const RouteStep = z.object({
  order: z.number().int().positive(),
  /** User-facing action text. */
  action: z.string().min(1),
  /** Agency id from the agency registry (data/raw/agencies.csv); null when no agency is involved. */
  agencyId: Slug.nullable(),
  /** Only set when the deadline is backed by a VERIFIED source. */
  deadlineDays: z.number().int().nonnegative().nullable(),
  documentTemplateId: Slug.nullable(),
});
export type RouteStep = z.infer<typeof RouteStep>;

/** Produced only by the deterministic Legal Routing Engine — never by the AI. */
export const RoutingDecision = z.object({
  routeType: RouteType,
  /** Id of the matched LegalRoute; null for FALLBACK. */
  routeId: Slug.nullable(),
  /** Primary agency to contact; null when none applies. */
  agencyId: Slug.nullable(),
  steps: z.array(RouteStep),
  /** True whenever the route is not VERIFIED or the analysis asks for review. */
  requiresHumanReview: z.boolean(),
});
export type RoutingDecision = z.infer<typeof RoutingDecision>;

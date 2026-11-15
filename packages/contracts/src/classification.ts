import { z } from "zod";

/**
 * Legal domains. Values intentionally match the team's taxonomy ids used in
 * data/raw/*.csv (column `soha`) so evaluation data stays comparable.
 */
export const LegalDomain = z.enum([
  "mehnat", // labor
  "oila", // family
  "zoravonlik", // domestic / family violence
  "qoshnichilik", // neighborhood
  "uy_joy_ijara", // housing & rent
  "istemolchi", // consumer
  "bank_firibgarlik", // banking & fraud
  "ijtimoiy_taminot", // social security
  "davlat_organlari", // public administration
  "ijro", // enforcement of decisions
  "chet_eldagilar", // citizens abroad
  "talim", // education
  "sogliq", // health
  "yer_mulk", // land & property
  "yol_harakati", // traffic
]);
export type LegalDomain = z.infer<typeof LegalDomain>;

/** Sub-cases that have a (placeholder) route in packages/legal-engine. Extend together with the engine. */
export const Subcase = z.enum(["UNPAID_WAGES", "NEIGHBOR_DISPUTE", "DOMESTIC_VIOLENCE"]);
export type Subcase = z.infer<typeof Subcase>;

export const Classification = z.object({
  domain: LegalDomain,
  /** null when the situation does not match a known sub-case. */
  subcase: Subcase.nullable(),
  /** Model confidence in [0, 1]. */
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof Classification>;

import { z } from "zod";
import { LEGAL_DOMAIN_IDS, PROBLEM_IDS } from "./generated/catalog";

/**
 * Legal domains (`sohalar`) from legal-knowledge/catalog/problems.json.
 * Generated — run `pnpm gen:contracts` after changing the catalog.
 */
export const LegalDomain = z.enum(LEGAL_DOMAIN_IDS);
export type LegalDomain = z.infer<typeof LegalDomain>;

/** Problem types P01–P65 from the catalog. Each one has a route in @lex/legal-engine. */
export const ProblemId = z.enum(PROBLEM_IDS);
export type ProblemId = z.infer<typeof ProblemId>;

/** AI classification. It names the problem type only — never an agency or a route. */
export const Classification = z.object({
  domain: LegalDomain,
  /** null when the story does not match a known problem type (routes to fallback). */
  problemId: ProblemId.nullable(),
  /** Model confidence in [0, 1]. */
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof Classification>;

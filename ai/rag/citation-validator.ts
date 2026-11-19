import type { LegalReference, ReviewStatus, VerificationStatus } from "@lex/contracts";
import type { CitationValidationResult, CitationValidator, RetrievedSource } from "./interfaces";

/** Maps a source document's verification state to the review status shown to users. */
const REVIEW_STATUS: Record<Exclude<VerificationStatus, "REJECTED">, ReviewStatus> = {
  VERIFIED: "VERIFIED",
  PENDING: "DRAFT",
};

/**
 * Accepts only references whose documentId was retrieved for this request.
 * Accepted references are rebuilt from the source document so the model can
 * never upgrade a citation's status or change its URL.
 */
export class AllowlistCitationValidator implements CitationValidator {
  validate(references: readonly LegalReference[], sources: readonly RetrievedSource[]): CitationValidationResult {
    const byId = new Map(sources.map((s) => [s.document.documentId, s.document]));
    const accepted: LegalReference[] = [];
    const rejected: LegalReference[] = [];

    for (const ref of references) {
      const doc = ref.documentId === null ? undefined : byId.get(ref.documentId);
      if (!doc || doc.verificationStatus === "REJECTED") {
        rejected.push(ref);
        continue;
      }
      accepted.push({
        documentId: doc.documentId,
        documentName: doc.documentName,
        article: doc.article,
        sourceUrl: doc.sourceUrl,
        status: REVIEW_STATUS[doc.verificationStatus],
        lastVerifiedAt: doc.lastVerifiedAt,
      });
    }
    return { accepted, rejected };
  }
}

/** A sentence produced by the model with the article keys it relies on. */
export interface CitedClaim {
  text: string;
  citations: string[];
}

/**
 * Keeps only citations to articles that were actually given to the model; a claim left
 * without any valid citation is removed (no unsupported legal statements reach users).
 * Returns the cleaned claims and how many citations were dropped.
 */
export function filterClaimCitations(
  claims: readonly CitedClaim[],
  allowedKeys: ReadonlySet<string>,
): { claims: CitedClaim[]; dropped: number } {
  let dropped = 0;
  const out: CitedClaim[] = [];
  for (const c of claims) {
    const valid = [...new Set(c.citations.map((k) => k.trim()))].filter((k) => allowedKeys.has(k));
    dropped += c.citations.length - valid.length;
    if (valid.length && c.text.trim()) out.push({ text: c.text.trim(), citations: valid });
  }
  return { claims: out, dropped };
}

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

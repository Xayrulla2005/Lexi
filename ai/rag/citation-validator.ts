import type { LegalReference } from "@lex/contracts";
import type { CitationValidationResult, CitationValidator, RetrievedSource } from "./interfaces";

/**
 * Accepts only references whose documentId was retrieved for this request.
 * Accepted references are rebuilt from the source document so the model can
 * never upgrade a citation's verificationStatus or change its URL.
 */
export class AllowlistCitationValidator implements CitationValidator {
  validate(references: readonly LegalReference[], sources: readonly RetrievedSource[]): CitationValidationResult {
    const byId = new Map(sources.map((s) => [s.document.documentId, s.document]));
    const accepted: LegalReference[] = [];
    const rejected: LegalReference[] = [];

    for (const ref of references) {
      const doc = byId.get(ref.documentId);
      if (!doc || doc.verificationStatus === "REJECTED") {
        rejected.push(ref);
        continue;
      }
      accepted.push({
        documentId: doc.documentId,
        documentName: doc.documentName,
        article: doc.article,
        sourceUrl: doc.sourceUrl,
        verificationStatus: doc.verificationStatus,
        lastVerifiedAt: doc.lastVerifiedAt,
      });
    }
    return { accepted, rejected };
  }
}

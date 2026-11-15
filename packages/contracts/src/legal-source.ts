import { z } from "zod";
import { LegalDomain } from "./classification";
import { IsoDateTime, Slug, VerificationStatus } from "./common";

/**
 * One article/section of a legal act stored in legal-knowledge/.
 * See legal-knowledge/README.md for the file format.
 */
export const LegalSourceDocument = z
  .object({
    documentId: Slug,
    documentName: z.string().min(1),
    article: z.string().min(1),
    domain: LegalDomain,
    text: z.string(),
    sourceUrl: z.string().url(),
    /** Date the cited edition entered into force (YYYY-MM-DD). */
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    verificationStatus: VerificationStatus,
    lastVerifiedAt: IsoDateTime.nullable(),
    /** Name or handle of the legal reviewer; null until reviewed. */
    reviewer: z.string().nullable(),
  })
  .refine((d) => d.verificationStatus !== "VERIFIED" || (d.lastVerifiedAt !== null && d.reviewer !== null), {
    message: "VERIFIED documents must have lastVerifiedAt and reviewer",
  });
export type LegalSourceDocument = z.infer<typeof LegalSourceDocument>;

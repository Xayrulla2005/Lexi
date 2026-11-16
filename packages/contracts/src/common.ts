import { z } from "zod";

/** ISO-8601 timestamp string (e.g. "2026-11-15T10:00:00.000Z"). */
export const IsoDateTime = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Verification state of a legal source document in legal-knowledge/ (RAG corpus). */
export const VerificationStatus = z.enum(["VERIFIED", "PENDING", "REJECTED"]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

/**
 * Legal review status of catalog content (routes, legal references).
 * DRAFT — not reviewed; VERIFIED_PENDING — review in progress; VERIFIED — confirmed by the legal reviewer.
 * Source of truth: legal-knowledge/catalog/review-status.json.
 */
export const ReviewStatus = z.enum(["DRAFT", "VERIFIED_PENDING", "VERIFIED"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

/** Identifier shared by agencies, routes and documents: latin letters, digits, `_`, `-`. */
export const Slug = z.string().regex(/^[A-Za-z0-9_-]+$/, "must contain only latin letters, digits, _ or -");

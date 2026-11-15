import { z } from "zod";

/** ISO-8601 timestamp string (e.g. "2026-11-15T10:00:00.000Z"). */
export const IsoDateTime = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Verification state of any legal artefact (source, reference, rule, route). */
export const VerificationStatus = z.enum(["VERIFIED", "PENDING", "REJECTED"]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

/** Identifier shared by agencies, routes and documents: latin letters, digits, `_`, `-`. */
export const Slug = z.string().regex(/^[A-Za-z0-9_-]+$/, "must contain only latin letters, digits, _ or -");

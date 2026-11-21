import { z } from "zod";
import { IsoDateTime } from "./common";

/**
 * Append-only audit log of the application lifecycle. Events never contain document content,
 * field values, signatures' bytes, PDFs or secrets — only ids, statuses and digests.
 * Each event carries the SHA-256 of the previous one (hash chain), so edits are detectable.
 */
export const AuditEventType = z.enum([
  "APPLICATION_CONSENTED",
  "APPLICATION_CONSENT_RESET",
  "APPLICATION_SIGNED",
  "DOCUMENT_ADDED",
  "DOCUMENT_REMOVED",
  "SUBMISSION_CREATED",
  "RECEIPT_ISSUED",
  "SUBMISSION_REPLAYED",
  "SUBMISSION_STATUS_CHANGED",
  "CONSULTATION_REQUESTED",
  "CONSULTATION_STATUS_CHANGED",
]);
export type AuditEventType = z.infer<typeof AuditEventType>;

export const AuditActor = z.object({
  type: z.enum(["citizen", "agency", "professional", "system"]),
  /** Citizen id, agency id, professional id, or null for the system. */
  id: z.string().nullable(),
});
export type AuditActor = z.infer<typeof AuditActor>;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const AuditEvent = z.object({
  id: z.string().uuid(),
  /** 1, 2, 3, … in write order. */
  seq: z.number().int().positive(),
  at: IsoDateTime,
  type: AuditEventType,
  actor: AuditActor,
  applicationId: z.string().uuid().nullable(),
  submissionId: z.string().uuid().nullable(),
  caseId: z.string().uuid().nullable(),
  /** Scalars only (statuses, ids, digests, flags). */
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  prevHash: Sha256,
  hash: Sha256,
});
export type AuditEvent = z.infer<typeof AuditEvent>;

/** Optional on POST /submissions: the same key returns the same submission instead of a second one. */
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
export const IdempotencyKey = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/, "8–128 chars: letters, digits, _ . : -");

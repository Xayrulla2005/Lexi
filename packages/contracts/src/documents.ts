import { z } from "zod";
import { IsoDateTime } from "./common";

/**
 * Supporting documents of an application (the template's "Ilova:" list).
 * Upload: POST /applications/:id/documents with the raw file as the body, its MIME type as
 * Content-Type, and the (URL-encoded) name and checklist item in the headers below.
 * The server checks the file's real type from its bytes; the name and MIME type alone are not trusted.
 */
export const DOCUMENT_CONTENT_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export const DocumentContentType = z.enum(DOCUMENT_CONTENT_TYPES);
export type DocumentContentType = z.infer<typeof DocumentContentType>;

/** 5 MiB per file. */
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
/** Per application. */
export const DOCUMENT_MAX_COUNT = 10;

export const DOCUMENT_NAME_HEADER = "x-file-name";
export const DOCUMENT_CHECKLIST_HEADER = "x-checklist-item";

export const ApplicationDocument = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  /** One of the template's "Ilova:" items, or null for an extra document. */
  checklistItem: z.string().min(1).max(200).nullable(),
  /** Display name only (sanitized); never used as a storage path. */
  fileName: z.string().min(1).max(120),
  /** Detected from the file's bytes. */
  contentType: DocumentContentType,
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  uploadedAt: IsoDateTime,
});
export type ApplicationDocument = z.infer<typeof ApplicationDocument>;

export const DocumentChecklistItem = z.object({
  label: z.string().min(1),
  provided: z.boolean(),
  documentIds: z.array(z.string().uuid()),
});
export type DocumentChecklistItem = z.infer<typeof DocumentChecklistItem>;

export const ApplicationDocuments = z.object({
  documents: z.array(ApplicationDocument),
  /** From the template's "Ilova:" line (empty when the template lists none). */
  checklist: z.array(DocumentChecklistItem),
  /** Checklist items without a document. Informational: the template does not mark items mandatory. */
  missing: z.array(z.string()),
});
export type ApplicationDocuments = z.infer<typeof ApplicationDocuments>;

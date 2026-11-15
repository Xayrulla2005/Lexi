import { z } from "zod";
import { IsoDateTime, Slug } from "./common";

/** MOCK = hackathon simulator. OFFICIAL = reserved; no official government integration exists. */
export const AdapterType = z.enum(["MOCK", "OFFICIAL"]);
export type AdapterType = z.infer<typeof AdapterType>;

export const SubmissionStatus = z.enum(["SUBMITTED", "RECEIVED", "IN_REVIEW", "ANSWERED", "OVERDUE", "ESCALATED"]);
export type SubmissionStatus = z.infer<typeof SubmissionStatus>;

export const AgencySubmission = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  agencyId: Slug,
  adapterType: AdapterType,
  status: SubmissionStatus,
  /** Receipt/reference number issued by the (mock) agency. */
  receiptId: z.string(),
  submittedAt: IsoDateTime,
  dueAt: IsoDateTime.nullable(),
});
export type AgencySubmission = z.infer<typeof AgencySubmission>;

/** Every external submission requires explicit user confirmation: `consent` must be literally `true`. */
export const SubmitToAgencyRequest = z.object({
  caseId: z.string().uuid(),
  agencyId: Slug,
  documentId: z.string().min(1).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Explicit user consent is required" }) }),
});
export type SubmitToAgencyRequest = z.infer<typeof SubmitToAgencyRequest>;

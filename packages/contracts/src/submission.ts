import { z } from "zod";
import { Fact } from "./analysis";
import { EriSignature, SignatureVerification } from "./application";
import { ProblemId } from "./classification";
import { IsoDateTime, Slug } from "./common";
import { SimCitizen } from "./sim";

/** MOCK = hackathon simulator. OFFICIAL = reserved; no official government integration exists. */
export const AdapterType = z.enum(["MOCK", "OFFICIAL"]);
export type AdapterType = z.infer<typeof AdapterType>;

/**
 * SUBMITTED -> RECEIVED -> IN_REVIEW -> ANSWERED, or
 * SUBMITTED -> ... -> OVERDUE -> ESCALATED (after the user submits the escalation draft).
 */
export const SubmissionStatus = z.enum(["SUBMITTED", "RECEIVED", "IN_REVIEW", "ANSWERED", "OVERDUE", "ESCALATED"]);
export type SubmissionStatus = z.infer<typeof SubmissionStatus>;

export const SubmissionStatusEvent = z.object({ status: SubmissionStatus, at: IsoDateTime });
export type SubmissionStatusEvent = z.infer<typeof SubmissionStatusEvent>;

export const AgencyResponse = z.object({
  text: z.string().min(1).max(5000),
  respondedAt: IsoDateTime,
});
export type AgencyResponse = z.infer<typeof AgencyResponse>;

export const AgencySubmission = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  applicationId: z.string().uuid(),
  agencyId: Slug,
  /** Catalog agency name, for "<Idora>dan javob keldi". */
  agencyName: z.string().min(1),
  adapterType: AdapterType,
  status: SubmissionStatus,
  /** Receipt/reference number issued by the (mock) agency. */
  receiptId: z.string(),
  submittedAt: IsoDateTime,
  /** Simulated response deadline (SIM_RESPONSE_DAYS × DEMO_SPEED). Not a legal deadline. */
  dueAt: IsoDateTime.nullable(),
  history: z.array(SubmissionStatusEvent),
  response: AgencyResponse.nullable(),
});
export type AgencySubmission = z.infer<typeof AgencySubmission>;

/** ish-malumoti.json of the package: what the agency needs to know about the case. */
export const CaseInfo = z.object({
  caseId: z.string().uuid(),
  problemId: ProblemId.nullable(),
  title: z.string().nullable(),
  facts: z.array(Fact),
  /** Filled application fields (key -> value). */
  fields: z.record(z.string(), z.string()),
});
export type CaseInfo = z.infer<typeof CaseInfo>;

/** Everything sent to an agency: ariza.pdf, imzo, ish-malumoti.json, consent time and the (simulated) citizen. */
export const SubmissionPackage = z.object({
  applicationId: z.string().uuid(),
  caseId: z.string().uuid(),
  agencyId: Slug,
  agencyName: z.string().min(1),
  /** ariza.pdf, base64 — exactly the signed bytes. */
  pdfBase64: z.string().min(1),
  signature: EriSignature,
  caseInfo: CaseInfo,
  consentAt: IsoDateTime,
  citizen: SimCitizen,
});
export type SubmissionPackage = z.infer<typeof SubmissionPackage>;

/** Every external submission requires explicit user confirmation: `consent` must be literally `true`. */
export const SubmitToAgencyRequest = z.object({
  applicationId: z.string().uuid(),
  consent: z.literal(true, { errorMap: () => ({ message: "Explicit user consent is required" }) }),
});
export type SubmitToAgencyRequest = z.infer<typeof SubmitToAgencyRequest>;

/** Citizen-side tracking view: the submission plus the escalation draft prepared when it became OVERDUE. */
export const SubmissionTracking = AgencySubmission.extend({
  /** Draft for the first escalation agency (not submitted — needs new consent and signature). */
  escalationApplicationId: z.string().uuid().nullable(),
});
export type SubmissionTracking = z.infer<typeof SubmissionTracking>;

/** SIMULATOR agency cabinet: one inbox item with its package (without the PDF bytes). */
export const InboxItem = z.object({
  submission: AgencySubmission,
  caseInfo: CaseInfo,
  citizen: SimCitizen,
  consentAt: IsoDateTime,
  signature: EriSignature,
  signatureCheck: SignatureVerification,
});
export type InboxItem = z.infer<typeof InboxItem>;

/** SIMULATOR agency cabinet actions. */
export const AgencyStatusUpdateRequest = z.object({ status: z.enum(["RECEIVED", "IN_REVIEW"]) });
export type AgencyStatusUpdateRequest = z.infer<typeof AgencyStatusUpdateRequest>;

export const AgencyRespondRequest = z.object({ text: z.string().trim().min(1).max(5000) });
export type AgencyRespondRequest = z.infer<typeof AgencyRespondRequest>;

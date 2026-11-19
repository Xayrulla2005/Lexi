import { z } from "zod";
import { IsoDateTime, Slug } from "./common";
import { AgencyContact } from "./routing";

/**
 * Where a template field value comes from:
 * ONEID  — the (simulated) OneID profile: fio, manzil, telefon;
 * SYSTEM — filled by the server: ariza_sanasi (today);
 * MANUAL — typed by the user in the form (tomorrow: suggested by the LLM).
 */
export const ApplicationFieldSource = z.enum(["ONEID", "SYSTEM", "MANUAL"]);
export type ApplicationFieldSource = z.infer<typeof ApplicationFieldSource>;

export const FieldKey = z.string().regex(/^[a-z0-9_]+$/);

/** Where a MANUAL value came from: the user's story ("hikoya") or an answer/form input ("javob"). */
export const FieldProvenance = z.enum(["hikoya", "javob"]);
export type FieldProvenance = z.infer<typeof FieldProvenance>;

export const ApplicationField = z.object({
  key: FieldKey,
  /** null while not filled in. */
  value: z.string().nullable(),
  source: ApplicationFieldSource,
  /** For MANUAL fields: who supplied the value. Defaults keep stored data valid. */
  provenance: FieldProvenance.nullable().default(null),
});
export type ApplicationField = z.infer<typeof ApplicationField>;

/** SIMULATED e-signature (ERI): Ed25519 over the SHA-256 digest of the exact PDF bytes. */
export const EriSignature = z.object({
  simulated: z.literal(true),
  algorithm: z.literal("Ed25519"),
  hashAlgorithm: z.literal("SHA-256"),
  /** Hex SHA-256 of the signed PDF bytes. */
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  /** Base64 signature over the raw digest bytes. */
  signature: z.string().min(1),
  /** SPKI PEM public key of the test citizen. */
  publicKey: z.string().min(1),
  signerCitizenId: Slug,
  signedAt: IsoDateTime,
});
export type EriSignature = z.infer<typeof EriSignature>;

export const SignatureVerification = z.object({
  valid: z.boolean(),
  message: z.enum(["Imzo haqiqiy", "Imzo buzilgan"]),
});
export type SignatureVerification = z.infer<typeof SignatureVerification>;

export const IntakeQuestion = z.object({
  key: FieldKey,
  question: z.string().min(1),
  status: z.enum(["open", "answered", "skipped"]),
});
export type IntakeQuestion = z.infer<typeof IntakeQuestion>;

/** Lexi's clarifying conversation for an application (at most 3 questions, one at a time). */
export const ApplicationIntake = z.object({
  /** Shown as "Sizni shunday tushundim: …". */
  understood: z.string().min(1),
  questions: z.array(IntakeQuestion).max(3),
  /** "<backend>:<model>" or "keyword" when no LLM was used. */
  model: z.string(),
  degraded: z.boolean(),
});
export type ApplicationIntake = z.infer<typeof ApplicationIntake>;

export const IntakeAnswerRequest = z.object({
  key: FieldKey,
  answer: z.string().trim().min(1).max(2000),
});
export type IntakeAnswerRequest = z.infer<typeof IntakeAnswerRequest>;

/** PRIMARY — to the route's primary agency; ESCALATION — draft for the first escalation agency after OVERDUE. */
export const ApplicationKind = z.enum(["PRIMARY", "ESCALATION"]);
export type ApplicationKind = z.infer<typeof ApplicationKind>;

/** An application built from legal-knowledge/templates/<templateId>.md. The template text is never changed. */
export const Application = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  kind: ApplicationKind,
  /** For ESCALATION drafts: the overdue submission that triggered it. */
  parentSubmissionId: z.string().uuid().nullable(),
  citizenId: Slug,
  templateId: Slug,
  /** Receiving agency (catalog contact). */
  agency: AgencyContact,
  /** Template text as in the file (without the leading HTML comment), placeholders intact. */
  template: z.string().min(1),
  fields: z.array(ApplicationField),
  /** Keys of fields that are still empty. */
  missingFields: z.array(FieldKey),
  /** When the user confirmed "Ma'lumotlarim to'g'ri va arizani yuborishga roziman"; reset when fields change. */
  consentAt: IsoDateTime.nullable(),
  signature: EriSignature.nullable(),
  submissionId: z.string().uuid().nullable(),
  /** null until the intake has run. */
  intake: ApplicationIntake.nullable().default(null),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Application = z.infer<typeof Application>;

export const UpdateApplicationFieldsRequest = z.object({
  values: z.record(FieldKey, z.string().max(2000)),
});
export type UpdateApplicationFieldsRequest = z.infer<typeof UpdateApplicationFieldsRequest>;

export const ConsentRequest = z.object({
  consent: z.literal(true, { errorMap: () => ({ message: "Explicit user consent is required" }) }),
});
export type ConsentRequest = z.infer<typeof ConsentRequest>;

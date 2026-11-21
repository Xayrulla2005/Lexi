import { z } from "zod";
import { LegalDomain } from "./classification";
import { IsoDateTime, Slug } from "./common";

/**
 * Legal marketplace (MVP). A professional's credentials are NEVER marked verified automatically:
 * verificationStatus changes only through a human review (not implemented yet), so every profile
 * starts UNVERIFIED. The demo directory (data/sim/professionals.json) is fictional and served
 * only with SIM_MODE=true.
 */
export const ProfessionalKind = z.enum(["advokat", "yurist"]);
export type ProfessionalKind = z.infer<typeof ProfessionalKind>;

export const ProfessionalVerification = z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]);
export type ProfessionalVerification = z.infer<typeof ProfessionalVerification>;

export const ProfileStatus = z.enum(["ACTIVE", "INACTIVE"]);
export type ProfileStatus = z.infer<typeof ProfileStatus>;

export const LegalProfessional = z.object({
  id: Slug,
  fullName: z.string().min(1),
  kind: ProfessionalKind,
  specializations: z.array(LegalDomain).min(1),
  /** Region (viloyat / shahar) as written in the profile. */
  region: z.string().min(1),
  languages: z.array(z.string().min(1)).min(1),
  verificationStatus: ProfessionalVerification,
  profileStatus: ProfileStatus,
  /** true for the fictional demo directory. */
  simulated: z.boolean(),
});
export type LegalProfessional = z.infer<typeof LegalProfessional>;

export const ProfessionalSearchQuery = z.object({
  domain: LegalDomain.optional(),
  region: z.string().trim().min(1).max(100).optional(),
  /** Recommend for this case (its classified domain); owner only. */
  caseId: z.string().uuid().optional(),
});
export type ProfessionalSearchQuery = z.infer<typeof ProfessionalSearchQuery>;

/**
 * REQUESTED -> ACCEPTED -> COMPLETED; REQUESTED -> DECLINED;
 * REQUESTED|ACCEPTED -> CANCELLED (by the citizen). DECLINED, CANCELLED, COMPLETED are final.
 */
export const ConsultationStatus = z.enum(["REQUESTED", "ACCEPTED", "DECLINED", "CANCELLED", "COMPLETED"]);
export type ConsultationStatus = z.infer<typeof ConsultationStatus>;

export const ConsultationRequest = z.object({
  id: z.string().uuid(),
  citizenId: Slug,
  professionalId: Slug,
  /** The citizen's own case, if they chose to link it (only its id; nothing else is shared automatically). */
  caseId: z.string().uuid().nullable(),
  message: z.string().min(1).max(1000),
  status: ConsultationStatus,
  history: z.array(z.object({ status: ConsultationStatus, at: IsoDateTime, by: z.enum(["citizen", "professional"]) })),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ConsultationRequest = z.infer<typeof ConsultationRequest>;

/** The citizen confirms that the message (and the linked case id) is shared with the professional. */
export const CreateConsultationRequest = z.object({
  professionalId: Slug,
  caseId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(1000),
  consent: z.literal(true, { errorMap: () => ({ message: "Explicit consent to share the request is required" }) }),
});
export type CreateConsultationRequest = z.infer<typeof CreateConsultationRequest>;

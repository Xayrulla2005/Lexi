/**
 * STRUCTURAL PLACEHOLDERS — NOT LEGAL ADVICE.
 *
 * These routes exist only to exercise the engine end-to-end. Their steps are
 * generic, contain no article numbers, deadlines or phone numbers, and are all
 * marked PENDING. A qualified legal reviewer must replace them with verified
 * content (with sourceDocumentIds from legal-knowledge/) before real use.
 *
 * Agency ids refer to the team-maintained registry in data/raw/agencies.csv.
 */
import type { LegalRoute, LegalRule, VerificationMetadata } from "../types";

const PENDING: VerificationMetadata = {
  status: "PENDING",
  lastVerifiedAt: null,
  reviewer: null,
  sourceDocumentIds: [],
  note: "Placeholder route awaiting legal review",
};

export const EMERGENCY_ROUTE: LegalRoute = {
  id: "EMERGENCY",
  version: 1,
  domain: "zoravonlik",
  subcase: null,
  agencyId: "iiv_102",
  steps: [
    {
      order: 1,
      action: "Darhol favqulodda xizmatga qo'ng'iroq qiling va xavfsiz joyga o'ting",
      agencyId: "iiv_102",
      deadlineDays: null,
      documentTemplateId: null,
    },
  ],
  // Escalation is always shown even while pending: safety takes precedence over verification.
  verification: { ...PENDING, note: "Emergency contact details must be verified by the legal team" },
};

export const FALLBACK_ROUTE: LegalRoute = {
  id: "FALLBACK",
  version: 1,
  domain: "davlat_organlari",
  subcase: null,
  agencyId: null,
  steps: [
    {
      order: 1,
      action: "Yurist bilan maslahatlashing (bepul yuridik yordam)",
      agencyId: null,
      deadlineDays: null,
      documentTemplateId: null,
    },
  ],
  verification: PENDING,
};

export const PLACEHOLDER_ROUTES: readonly LegalRoute[] = [
  {
    id: "UNPAID_WAGES",
    version: 1,
    domain: "mehnat",
    subcase: "UNPAID_WAGES",
    agencyId: "mehnat_inspeksiyasi",
    steps: [
      { order: 1, action: "Ish beruvchiga yozma talabnoma yuborish", agencyId: null, deadlineDays: null, documentTemplateId: null },
      { order: 2, action: "Mehnat inspeksiyasiga ariza berish", agencyId: "mehnat_inspeksiyasi", deadlineDays: null, documentTemplateId: null },
      { order: 3, action: "Sudga da'vo arizasi berish (yurist bilan)", agencyId: null, deadlineDays: null, documentTemplateId: null },
    ],
    verification: PENDING,
  },
  {
    id: "NEIGHBOR_DISPUTE",
    version: 1,
    domain: "qoshnichilik",
    subcase: "NEIGHBOR_DISPUTE",
    agencyId: "profilaktika_inspektori",
    steps: [
      { order: 1, action: "Profilaktika inspektoriga murojaat qilish", agencyId: "profilaktika_inspektori", deadlineDays: null, documentTemplateId: null },
    ],
    verification: PENDING,
  },
  {
    id: "DOMESTIC_VIOLENCE",
    version: 1,
    domain: "zoravonlik",
    subcase: "DOMESTIC_VIOLENCE",
    agencyId: "profilaktika_inspektori",
    steps: [
      { order: 1, action: "Profilaktika inspektoriga murojaat qilish", agencyId: "profilaktika_inspektori", deadlineDays: null, documentTemplateId: null },
      { order: 2, action: "Yurist yoki ishonch markazi bilan bog'lanish", agencyId: null, deadlineDays: null, documentTemplateId: null },
    ],
    verification: PENDING,
  },
];

/** One rule per placeholder route: match on classified sub-case. */
export const PLACEHOLDER_RULES: readonly LegalRule[] = PLACEHOLDER_ROUTES.map((route, i) => ({
  id: `rule.${route.id}`,
  description: `classification.subcase === ${route.subcase}`,
  priority: 100 + i,
  routeId: route.id,
  matches: ({ analysis }) => analysis.classification.subcase === route.subcase,
  verification: PENDING,
}));

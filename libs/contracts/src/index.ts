/**
 * Jamoa kelishuvi. Xayrulla va Jayhun birgalikda o'zgartiradi.
 * Bu fayl o'zgarsa, api, ai, web va bot birdaniga yangilanadi.
 */
import { z } from "zod";

export const RiskLevel = z.enum(["red", "orange", "yellow", "green"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

/** Huquq sohalari — Mirjalolning taksonomiyasi bilan bir xil bo'lishi shart */
export const Category = z.enum([
  "mehnat",
  "oila",
  "zoravonlik",
  "qoshnichilik",
  "uy_joy_ijara",
  "istemolchi",
  "bank_firibgarlik",
  "ijtimoiy_taminot",
  "davlat_organlari",
  "ijro",
  "chet_eldagilar",
  "talim",
  "sogliq",
  "yer_mulk",
  "yol_harakati",
]);
export type Category = z.infer<typeof Category>;

/** Qonun moddasiga havola. source_id faqat qidiruvda topilgan moddadan bo'lishi mumkin */
const Sourced = z.object({
  text: z.string(),
  source_id: z.string(),
});

/** libs/ai -> analyze() qaytaradigan natija */
export const AnalysisResult = z.object({
  risk: z.object({
    level: RiskLevel,
    reasons: z.array(z.string()),
  }),
  category: Category,
  subcase: z.string().nullable(),
  /** Idoralar faqat data/raw/agencies.csv dagi id'lardan */
  agency_candidates: z.array(z.string()),
  too_early: z.array(z.string()),
  analysis: z.object({
    object: z.string(),
    objective_side: z.string(),
    subject: z.string(),
    subjective_side: z.string(),
  }),
  rights: z.array(Sourced),
  obligations: z.array(Sourced),
  user_mistakes: z.array(z.string()),
  evidence_needed: z.array(z.string()),
  missing_info: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  needs_lawyer: z.boolean(),
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;

export const AnalyzeInput = z.object({
  text: z.string().min(1),
  language: z.enum(["uz-latn", "uz-cyrl", "ru", "mixed"]).optional(),
});
export type AnalyzeInput = z.infer<typeof AnalyzeInput>;

export const AppealStatus = z.enum([
  "draft",
  "submitted",
  "received",
  "in_review",
  "answered",
  "overdue",
  "escalated",
]);
export type AppealStatus = z.infer<typeof AppealStatus>;

/** Yo'l xaritasidagi bitta qadam */
export const RouteStep = z.object({
  order: z.number().int(),
  agency_id: z.string(),
  action: z.string(),
  deadline_days: z.number().int().nullable(),
  document_template: z.string().nullable(),
});
export type RouteStep = z.infer<typeof RouteStep>;

export const RoutePlan = z.object({
  /** verified = Mirjalol xaritasidan; generic = umumiy yo'l */
  kind: z.enum(["emergency", "verified", "generic"]),
  steps: z.array(RouteStep),
});
export type RoutePlan = z.infer<typeof RoutePlan>;

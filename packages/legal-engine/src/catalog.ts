/**
 * Loads legal-knowledge/catalog/problems.json (+ review-status.json) and turns it
 * into LegalRoute objects. The catalog is the single source of truth: every text,
 * phone number and law citation is copied verbatim — nothing is added here.
 *
 * Any inconsistency (schema error, unknown agency id, missing review status)
 * throws a CatalogError at load time, so a broken catalog never reaches users.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
  type AgencyContact,
  LegalDomain,
  type LegalReference,
  ProblemId,
  ReviewStatus,
  RiskLevel,
  type RouteStep,
  Slug,
} from "@lex/contracts";
import type { LegalCatalog, LegalRoute } from "./types";

/** Default location, resolved from both src/ and dist/ of this package. */
export const DEFAULT_CATALOG_PATH = resolve(__dirname, "../../../legal-knowledge/catalog/problems.json");
export const REVIEW_STATUS_FILE = "review-status.json";

/** The other party of a dispute (debtor, seller, employer...). Not an agency to contact. */
export const OTHER_PARTY_ID = "qarshi_taraf";
/** Agencies of the emergency route, in display order. */
export const EMERGENCY_AGENCY_IDS = ["iiv", "ishonch_1146", "tez_yordam"] as const;
/** Free legal advice (advice.uz) — the only agency of the fallback route. */
export const FALLBACK_AGENCY_ID = "adliya";
/** The only text of the emergency route that is not an agency name or phone. */
export const EMERGENCY_SAFETY_TEXT = "Hozir hayotingizga xavf bo'lsa, darhol qo'ng'iroq qiling.";
/** Prefix of the escalation step: "Javob bo'lmasa: <first escalation agency>". */
export const NO_ANSWER_PREFIX = "Javob bo'lmasa:";

export class CatalogError extends Error {
  override readonly name = "CatalogError";
}

const AgencySource = z
  .object({
    nomi: z.string().min(1),
    telefon: z.string(),
    havola: z.string(),
    izoh: z.string(),
    tekshir: z.boolean(),
    /** Optional agency response deadline in days. Only the legal reviewer fills it in. */
    javob_muddati: z.number().int().positive().optional(),
  })
  .strict();

const ProblemSource = z
  .object({
    id: ProblemId,
    nom: z.string().min(1),
    soha: LegalDomain,
    xavf: RiskLevel,
    qonunlar: z.array(z.string().min(1)),
    organlar: z.array(Slug).min(1),
    eskalatsiya: z.array(Slug),
    birinchi_qadam: z.string().min(1),
    hali_erta: z.array(Slug),
    tekshir: z.array(z.string()),
    shablon_id: Slug.nullable(),
    manba: z.string(),
  })
  .strict();

const CatalogSource = z
  .object({
    versiya: z.string().min(1),
    sohalar: z.record(LegalDomain, z.string().min(1)),
    idoralar: z.record(Slug, AgencySource),
    muammolar: z.array(ProblemSource).min(1),
  })
  .strict();

const ReviewStatusSource = z
  .object({
    $comment: z.string().optional(),
    catalogVersion: z.string().min(1),
    statuses: z.record(z.string(), ReviewStatus),
  })
  .strict();

type AgencySource = z.infer<typeof AgencySource>;

function parse<T>(schema: z.ZodType<T>, raw: unknown, file: string): T {
  const res = schema.safeParse(raw);
  if (res.success) return res.data;
  const issues = res.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  throw new CatalogError(`${file} is invalid: ${issues}`);
}

const orNull = (s: string): string | null => (s.trim() ? s : null);

/** Builds the route steps' action text for an agency: name and phone only, as in the catalog. */
const agencyAction = (a: AgencyContact): string => (a.phone ? `${a.name} — ${a.phone}` : a.name);

const agencyStep = (a: AgencyContact, order: number): RouteStep => ({
  order,
  action: agencyAction(a),
  agencyId: a.id,
  deadlineDays: null,
  documentTemplateId: null,
});

/**
 * Pure part of the loader: validates already-parsed JSON and builds the catalog.
 * Exposed for tests; production code uses loadCatalog().
 */
export function buildCatalog(problemsJson: unknown, reviewStatusJson: unknown): LegalCatalog {
  const src = parse(CatalogSource, problemsJson, "problems.json");
  const review = parse(ReviewStatusSource, reviewStatusJson, REVIEW_STATUS_FILE);

  if (review.catalogVersion !== src.versiya) {
    throw new CatalogError(
      `${REVIEW_STATUS_FILE} is for catalog ${review.catalogVersion}, but problems.json is ${src.versiya}; re-review the statuses`,
    );
  }

  const agencies = new Map<string, AgencyContact>(
    Object.entries(src.idoralar).map(([id, a]: [string, AgencySource]) => [
      id,
      { id, name: a.nomi, phone: orNull(a.telefon), link: orNull(a.havola), responseDays: a.javob_muddati ?? null },
    ]),
  );
  const agency = (id: string, where: string): AgencyContact => {
    const a = agencies.get(id);
    if (!a) throw new CatalogError(`${where} references unknown agency "${id}" (not in idoralar)`);
    return a;
  };

  const knownRouteIds = new Set<string>(["EMERGENCY", "FALLBACK", ...src.muammolar.map((m) => m.id)]);
  for (const id of Object.keys(review.statuses)) {
    if (!knownRouteIds.has(id)) throw new CatalogError(`${REVIEW_STATUS_FILE} has a status for unknown route "${id}"`);
  }
  const statusOf = (routeId: string): ReviewStatus => {
    const s = review.statuses[routeId];
    if (!s) throw new CatalogError(`${REVIEW_STATUS_FILE} has no status for route "${routeId}"`);
    return s;
  };

  const seen = new Set<string>();
  const routes = src.muammolar.map((m): LegalRoute => {
    if (seen.has(m.id)) throw new CatalogError(`problems.json has duplicate problem id ${m.id}`);
    seen.add(m.id);

    const routeAgencies = m.organlar.map((id) => agency(id, `${m.id}.organlar`));
    const legalReferences = m.qonunlar.map(
      (name): LegalReference => ({
        documentId: null,
        documentName: name,
        article: null,
        sourceUrl: null,
        status: "DRAFT",
        lastVerifiedAt: null,
      }),
    );
    // Agencies are listed separately (decision.agencies); steps are only the first step and
    // the first escalation agency, so the agency list is not repeated as steps.
    const escalation = m.eskalatsiya.map((id) => agency(id, `${m.id}.eskalatsiya`));
    const steps: RouteStep[] = [
      { order: 1, action: m.birinchi_qadam, agencyId: null, deadlineDays: null, documentTemplateId: m.shablon_id },
    ];
    const firstEscalation = escalation[0];
    if (firstEscalation) {
      steps.push({
        order: 2,
        action: `${NO_ANSWER_PREFIX} ${firstEscalation.name}`,
        agencyId: firstEscalation.id,
        deadlineDays: null,
        documentTemplateId: null,
      });
    }

    return {
      id: m.id,
      catalogVersion: src.versiya,
      problemId: m.id,
      title: m.nom,
      domain: m.soha,
      riskLevel: m.xavf,
      firstStep: m.birinchi_qadam,
      agencyId: routeAgencies.find((a) => a.id !== OTHER_PARTY_ID)?.id ?? null,
      agencies: routeAgencies,
      escalation,
      notYet: m.hali_erta.map((id) => agency(id, `${m.id}.hali_erta`)),
      steps,
      legalReferences,
      templateId: m.shablon_id,
      reviewNotes: m.tekshir,
      reviewStatus: statusOf(m.id),
    };
  });

  const builtIn = (
    id: "EMERGENCY" | "FALLBACK",
    agencyId: string | null,
    contacts: AgencyContact[],
    steps: RouteStep[],
  ): LegalRoute => ({
    id,
    catalogVersion: src.versiya,
    problemId: null,
    title: null,
    domain: null,
    riskLevel: null,
    firstStep: null,
    agencyId,
    agencies: contacts,
    escalation: [],
    notYet: [],
    steps,
    legalReferences: [],
    templateId: null,
    reviewNotes: [],
    reviewStatus: statusOf(id),
  });

  const emergencyContacts = EMERGENCY_AGENCY_IDS.map((id) => agency(id, "EMERGENCY"));
  const emergency = builtIn("EMERGENCY", EMERGENCY_AGENCY_IDS[0], emergencyContacts, [
    { order: 1, action: EMERGENCY_SAFETY_TEXT, agencyId: null, deadlineDays: null, documentTemplateId: null },
    ...emergencyContacts.map((a, i) => agencyStep(a, i + 2)),
  ]);

  const fallbackContact = agency(FALLBACK_AGENCY_ID, "FALLBACK");
  // No primary agency: the fallback only shows contacts and never offers a submission.
  const fallback = builtIn("FALLBACK", null, [fallbackContact], [agencyStep(fallbackContact, 1)]);

  return { version: src.versiya, routes, emergency, fallback };
}

function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new CatalogError(`cannot read ${path}: ${(e as Error).message}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new CatalogError(`${path} is not valid JSON: ${(e as Error).message}`);
  }
}

/**
 * Reads problems.json and the review-status.json next to it.
 * @throws CatalogError when either file is missing or inconsistent.
 */
export function loadCatalog(
  path: string = DEFAULT_CATALOG_PATH,
  reviewStatusPath: string = join(dirname(path), REVIEW_STATUS_FILE),
): LegalCatalog {
  return buildCatalog(readJson(path), readJson(reviewStatusPath));
}

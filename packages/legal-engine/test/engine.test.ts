import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type AnalysisResult, PROBLEM_IDS, RoutingDecision } from "@lex/contracts";
import {
  buildCatalog,
  CatalogError,
  createDefaultRoutingEngine,
  DEFAULT_CATALOG_PATH,
  EMERGENCY_SAFETY_TEXT,
  loadCatalog,
  REVIEW_NOTICES,
} from "../src";

interface RawProblem {
  id: string;
  birinchi_qadam: string;
  organlar: string[];
  eskalatsiya: string[];
  qonunlar: string[];
}
interface RawCatalog {
  idoralar: Record<string, { nomi: string; telefon: string; havola: string }>;
  muammolar: RawProblem[];
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8")) as unknown;
const rawProblems = readJson(DEFAULT_CATALOG_PATH) as RawCatalog;
const rawReview = readJson(join(DEFAULT_CATALOG_PATH, "../review-status.json"));
const clone = <T>(v: T): T => structuredClone(v);

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    schemaVersion: "2.0",
    caseSummary: "",
    classification: { domain: "mehnat", problemId: "P12", confidence: 0.9 },
    risk: { level: "yellow", signals: [], requiresImmediateAction: false },
    facts: [],
    missingInformation: [],
    legalReferences: [],
    followUpQuestions: [],
    needsHumanReview: false,
    ...overrides,
  };
}

describe("loadCatalog", () => {
  const catalog = loadCatalog();

  it("loads 65 routes with ids P01–P65", () => {
    expect(catalog.routes).toHaveLength(65);
    expect(catalog.routes.map((r) => r.id)).toEqual([...PROBLEM_IDS]);
  });

  it("maps laws to DRAFT LegalReferences and keeps reviewer notes", () => {
    const p12 = catalog.routes.find((r) => r.id === "P12");
    const raw = rawProblems.muammolar.find((m) => m.id === "P12");
    expect(p12?.legalReferences.map((r) => r.documentName)).toEqual(raw?.qonunlar);
    expect(p12?.legalReferences.every((r) => r.status === "DRAFT" && r.documentId === null)).toBe(true);
    expect(p12?.reviewNotes.length).toBeGreaterThan(0);
  });

  it("reads review statuses from review-status.json", () => {
    const pending = catalog.routes.filter((r) => r.reviewStatus === "VERIFIED_PENDING").map((r) => r.id);
    expect(pending).toEqual(["P12", "P25", "P42", "P44"]);
    expect(catalog.routes.filter((r) => r.reviewStatus === "VERIFIED")).toEqual([]);
  });

  it("fails with a clear error on an unknown agency id", () => {
    const bad = clone(rawProblems);
    bad.muammolar[0]!.organlar.push("yoq_idora");
    expect(() => buildCatalog(bad, rawReview)).toThrow(CatalogError);
    expect(() => buildCatalog(bad, rawReview)).toThrow(/P01\.organlar references unknown agency "yoq_idora"/);

    const badEscalation = clone(rawProblems);
    badEscalation.muammolar[1]!.eskalatsiya.push("yoq_idora");
    expect(() => buildCatalog(badEscalation, rawReview)).toThrow(/P02\.eskalatsiya references unknown agency/);
  });

  it("fails when a route has no review status", () => {
    const review = clone(rawReview) as { statuses: Record<string, string> };
    delete review.statuses.P05;
    expect(() => buildCatalog(rawProblems, review)).toThrow(/no status for route "P05"/);
  });

  it("reads the optional agency javob_muddati (null when absent)", () => {
    const withDays = clone(rawProblems) as RawCatalog & { idoralar: Record<string, Record<string, unknown>> };
    withDays.idoralar.mehnat_inspeksiyasi!.javob_muddati = 10;
    const p12 = buildCatalog(withDays, rawReview).routes.find((r) => r.id === "P12")!;
    expect(p12.agencies.find((a) => a.id === "mehnat_inspeksiyasi")?.responseDays).toBe(10);
    expect(p12.agencies.find((a) => a.id === "sud_fuqarolik")?.responseDays).toBeNull();

    const bad = clone(rawProblems) as RawCatalog & { idoralar: Record<string, Record<string, unknown>> };
    bad.idoralar.mehnat_inspeksiyasi!.javob_muddati = 0;
    expect(() => buildCatalog(bad, rawReview)).toThrow(/idoralar\.mehnat_inspeksiyasi\.javob_muddati/);
  });

  it("fails on a schema error", () => {
    const bad = clone(rawProblems);
    (bad.muammolar[0] as unknown as Record<string, unknown>).xavf = "CRITICAL";
    expect(() => buildCatalog(bad, rawReview)).toThrow(/problems\.json is invalid: muammolar\.0\.xavf/);
  });
});

describe("DeterministicRoutingEngine", () => {
  const engine = createDefaultRoutingEngine();

  it("red risk -> emergency with iiv, ishonch_1146, tez_yordam from the catalog", () => {
    const risk: AnalysisResult["risk"] = { level: "red", signals: ["pichoq"], requiresImmediateAction: true };
    const { decision } = engine.route({ analysis: analysis({ risk }) });
    expect(decision.routeType).toBe("EMERGENCY");
    expect(decision.routeId).toBe("EMERGENCY");
    expect(decision.agencyId).toBe("iiv");
    expect(decision.agencies.map((a) => a.id)).toEqual(["iiv", "ishonch_1146", "tez_yordam"]);
    expect(decision.steps[0]?.action).toBe(EMERGENCY_SAFETY_TEXT);
    for (const a of decision.agencies) {
      const raw = rawProblems.idoralar[a.id]!;
      expect(a.name).toBe(raw.nomi);
      expect(a.phone).toBe(raw.telefon);
      expect(decision.steps.map((s) => s.action)).toContain(`${raw.nomi} — ${raw.telefon}`);
    }
    expect(decision.steps).toHaveLength(4);
  });

  it("P12 -> first step and agencies exactly as in the catalog", () => {
    const raw = rawProblems.muammolar.find((m) => m.id === "P12")!;
    const { decision, reviewStatus, reviewNotice } = engine.route({ analysis: analysis() });
    expect(decision.routeType).toBe("RULE_BASED");
    expect(decision.routeId).toBe("P12");
    expect(decision.problemId).toBe("P12");
    expect(decision.steps[0]?.action).toBe(raw.birinchi_qadam);
    expect(decision.steps[0]?.documentTemplateId).toBe("T12");
    const firstEscalation = rawProblems.idoralar[raw.eskalatsiya[0]!]!;
    expect(decision.steps[1]).toMatchObject({ action: `Javob bo'lmasa: ${firstEscalation.nomi}`, agencyId: raw.eskalatsiya[0] });
    expect(decision.steps).toHaveLength(2);
    expect(decision.agencies.map((a) => a.id)).toEqual(raw.organlar);
    expect(decision.escalation.map((a) => a.id)).toEqual(raw.eskalatsiya);
    expect(decision.agencyId).toBe("mehnat_inspeksiyasi");
    expect(decision.templateId).toBe("T12");
    expect(reviewStatus).toBe("VERIFIED_PENDING");
    expect(reviewNotice).toBe(REVIEW_NOTICES.VERIFIED_PENDING);
    expect(decision.requiresHumanReview).toBe(true);
  });

  it("DRAFT routes carry the draft notice", () => {
    const classification = { domain: "fuqarolik_nizo", problemId: "P01", confidence: 0.9 } as const;
    const { decision } = engine.route({ analysis: analysis({ classification }) });
    expect(decision.reviewStatus).toBe("DRAFT");
    expect(decision.reviewNotice).toBe("Bu yo'l hali yurist tomonidan tekshirilmagan");
  });

  it("problemId null -> fallback (adliya / advice.uz)", () => {
    const classification = { domain: "talim", problemId: null, confidence: 0.3 } as const;
    const { decision } = engine.route({ analysis: analysis({ classification }) });
    expect(decision.routeType).toBe("FALLBACK");
    expect(decision.routeId).toBeNull();
    expect(decision.agencyId).toBeNull();
    expect(decision.agencies.map((a) => a.id)).toEqual(["adliya"]);
    expect(decision.agencies[0]?.link).toBe("https://advice.uz");
    expect(decision.requiresHumanReview).toBe(true);
  });

  it("every decision satisfies the RoutingDecision contract", () => {
    for (const problemId of PROBLEM_IDS) {
      const classification = { domain: "mehnat", problemId, confidence: 0.9 } as const;
      const { decision } = engine.route({ analysis: analysis({ classification }) });
      expect(RoutingDecision.safeParse(decision).success).toBe(true);
      for (const s of decision.steps) expect(s.deadlineDays).toBeNull();
    }
  });

  it("is deterministic", () => {
    const ctx = { analysis: analysis() };
    expect(engine.route(ctx)).toEqual(engine.route(ctx));
  });
});

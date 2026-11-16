import { describe, expect, it } from "vitest";
import {
  AnalysisResult,
  LEGAL_DOMAIN_IDS,
  LegalReference,
  LegalSourceDocument,
  PROBLEM_IDS,
  SubmitToAgencyRequest,
} from "../src";

const validAnalysis = {
  schemaVersion: "2.0",
  caseSummary: "Ish haqi 3 oydan beri to'lanmagan",
  classification: { domain: "mehnat", problemId: "P12", confidence: 0.8 },
  risk: { level: "yellow", signals: [], requiresImmediateAction: false },
  facts: [{ statement: "3 oydan beri ish haqi to'lanmagan", source: "USER_REPORTED" }],
  missingInformation: ["Mehnat shartnomasi bormi?"],
  legalReferences: [],
  followUpQuestions: [],
  needsHumanReview: false,
};

describe("generated catalog ids", () => {
  it("contains the 19 catalog domains and 65 problem ids", () => {
    expect(LEGAL_DOMAIN_IDS).toHaveLength(19);
    expect(LEGAL_DOMAIN_IDS).toEqual(expect.arrayContaining(["fuqarolik_nizo", "jinoyat", "korrupsiya", "jamoat_tartibi"]));
    expect(PROBLEM_IDS).toHaveLength(65);
    expect(PROBLEM_IDS[0]).toBe("P01");
    expect(PROBLEM_IDS[64]).toBe("P65");
  });
});

describe("AnalysisResult", () => {
  it("accepts a well-formed analysis", () => {
    expect(AnalysisResult.safeParse(validAnalysis).success).toBe(true);
  });

  it("accepts problemId null (fallback)", () => {
    const none = { ...validAnalysis, classification: { domain: "oila", problemId: null, confidence: 0.3 } };
    expect(AnalysisResult.safeParse(none).success).toBe(true);
  });

  it("rejects unknown risk levels, problem ids and domains", () => {
    const badRisk = { ...validAnalysis, risk: { ...validAnalysis.risk, level: "CRITICAL" } };
    const badProblem = { ...validAnalysis, classification: { ...validAnalysis.classification, problemId: "P99" } };
    const badDomain = { ...validAnalysis, classification: { ...validAnalysis.classification, domain: "invented" } };
    expect(AnalysisResult.safeParse(badRisk).success).toBe(false);
    expect(AnalysisResult.safeParse(badProblem).success).toBe(false);
    expect(AnalysisResult.safeParse(badDomain).success).toBe(false);
  });

  it("does not let the AI return an agency in the classification", () => {
    const parsed = AnalysisResult.parse({
      ...validAnalysis,
      classification: { ...validAnalysis.classification, agencyId: "mehnat_inspeksiyasi" },
    });
    expect(parsed.classification).not.toHaveProperty("agencyId");
  });
});

describe("LegalReference", () => {
  it("accepts a catalog citation with DRAFT status", () => {
    const ref = {
      documentId: null,
      documentName: "Mehnat kodeksi 253-modda",
      article: null,
      sourceUrl: null,
      status: "DRAFT",
      lastVerifiedAt: null,
    };
    expect(LegalReference.safeParse(ref).success).toBe(true);
    expect(LegalReference.safeParse({ ...ref, status: "PENDING" }).success).toBe(false);
  });
});

describe("SubmitToAgencyRequest", () => {
  const base = { caseId: "8c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11", agencyId: "mehnat_inspeksiyasi" };

  it("requires consent === true", () => {
    expect(SubmitToAgencyRequest.safeParse({ ...base, consent: true }).success).toBe(true);
    expect(SubmitToAgencyRequest.safeParse({ ...base, consent: false }).success).toBe(false);
    expect(SubmitToAgencyRequest.safeParse(base).success).toBe(false);
  });
});

describe("LegalSourceDocument", () => {
  const doc = {
    documentId: "EXAMPLE-1",
    documentName: "Example act",
    article: "1",
    domain: "mehnat",
    text: "",
    sourceUrl: "https://example.org/act",
    effectiveDate: "2026-01-01",
    verificationStatus: "VERIFIED",
    lastVerifiedAt: null,
    reviewer: null,
  };

  it("cannot be VERIFIED without reviewer metadata", () => {
    expect(LegalSourceDocument.safeParse(doc).success).toBe(false);
    expect(LegalSourceDocument.safeParse({ ...doc, verificationStatus: "PENDING" }).success).toBe(true);
  });
});

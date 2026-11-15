import { describe, expect, it } from "vitest";
import { AnalysisResult, LegalSourceDocument, SubmitToAgencyRequest } from "../src";

const validAnalysis = {
  schemaVersion: "1.0",
  caseSummary: "Ish haqi 3 oydan beri to'lanmagan",
  classification: { domain: "mehnat", subcase: "UNPAID_WAGES", confidence: 0.8 },
  risk: { level: "NORMAL", signals: [], requiresImmediateAction: false },
  facts: [{ statement: "3 oydan beri ish haqi to'lanmagan", source: "USER_REPORTED" }],
  missingInformation: ["Mehnat shartnomasi bormi?"],
  legalReferences: [],
  followUpQuestions: [],
  needsHumanReview: false,
};

describe("AnalysisResult", () => {
  it("accepts a well-formed analysis", () => {
    expect(AnalysisResult.safeParse(validAnalysis).success).toBe(true);
  });

  it("rejects unknown risk levels and invented sub-cases", () => {
    const badRisk = { ...validAnalysis, risk: { ...validAnalysis.risk, level: "red" } };
    const badSubcase = { ...validAnalysis, classification: { ...validAnalysis.classification, subcase: "INVENTED" } };
    expect(AnalysisResult.safeParse(badRisk).success).toBe(false);
    expect(AnalysisResult.safeParse(badSubcase).success).toBe(false);
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

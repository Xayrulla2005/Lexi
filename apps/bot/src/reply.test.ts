import { describe, expect, it } from "vitest";
import type { Case, RoutingDecision } from "@lex/contracts";
import { composeReply, webApplicationUrl } from "./reply";
import { texts } from "./texts.uz";

const decision = (o: Partial<RoutingDecision>): RoutingDecision => ({
  routeType: "RULE_BASED",
  routeId: "P12",
  problemId: "P12",
  title: "Ish haqini o'z vaqtida to'lamaslik",
  agencyId: "mehnat_inspeksiyasi",
  steps: [{ order: 1, action: "Ish beruvchiga yozma talabnoma", agencyId: null, deadlineDays: null, documentTemplateId: "T12" }],
  agencies: [],
  escalation: [],
  notYet: [],
  legalReferences: [
    { documentId: null, documentName: "Mehnat kodeksi 253-modda", article: null, sourceUrl: null, status: "DRAFT", lastVerifiedAt: null },
  ],
  templateId: "T12",
  reviewStatus: "DRAFT",
  reviewNotice: "Bu yo'l hali yurist tomonidan tekshirilmagan",
  requiresHumanReview: true,
  ...o,
});

const kase = (d: RoutingDecision, summary: string[] = []): Case => ({
  id: "8c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11",
  userId: "1",
  channel: "bot",
  status: "ANALYZED",
  messages: [],
  analysis: {
    schemaVersion: "2.0",
    caseSummary: "",
    classification: { domain: "mehnat", problemId: d.problemId, confidence: 0.9 },
    risk: { level: "yellow", signals: [], requiresImmediateAction: false },
    facts: [],
    missingInformation: [],
    legalReferences: [],
    followUpQuestions: [],
    needsHumanReview: true,
  },
  routingDecision: d,
  legalAnalysis: summary.length
    ? {
        summary: summary.map((text) => ({ text, citations: ["mehnat_kodeksi/253"] })),
        rights: [],
        obligations: [],
        deadlines: [],
        articles: [],
        reviewNotice: null,
        model: "fake",
        droppedCitations: 0,
        suggestedAgencyIds: [],
      }
    : null,
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
});

describe("composeReply", () => {
  it("one message: risk, steps, laws, short analysis, notice; no lawyer hint on a catalog route", () => {
    const text = composeReply(kase(decision({}), ["Ish haqi o'z vaqtida to'lanishi shart."]), texts);
    expect(text).toContain(texts.riskLabels.yellow);
    expect(text).toContain("1. Ish beruvchiga yozma talabnoma");
    expect(text).toContain("• Mehnat kodeksi 253-modda");
    expect(text).toContain("Ish haqi o'z vaqtida to'lanishi shart.");
    expect(text).toContain("⚠ Bu yo'l hali yurist tomonidan tekshirilmagan");
    expect(text).not.toContain(texts.lawyer);
  });

  it("lawyer hint only on the fallback route", () => {
    const text = composeReply(kase(decision({ routeType: "FALLBACK", routeId: null, problemId: null, templateId: null })), texts);
    expect(text).toContain(texts.lawyer);
  });
});

describe("webApplicationUrl", () => {
  it("puts problemId and the story into the query", () => {
    const url = new URL(webApplicationUrl("https://lex.example/", "P12", "3 oydan beri oylik berishmayapti"));
    expect(url.searchParams.get("problemId")).toBe("P12");
    expect(url.searchParams.get("text")).toBe("3 oydan beri oylik berishmayapti");
  });
});

import { describe, expect, it } from "vitest";
import type { RoutingDecision } from "@lex/contracts";
import { isUrl, lawNames, phoneParts, riskTone, routeKind, statusKey } from "./view";

const decision = (overrides: Partial<RoutingDecision>): RoutingDecision => ({
  routeType: "RULE_BASED",
  routeId: "P12",
  problemId: "P12",
  title: "Ish haqini o'z vaqtida to'lamaslik",
  agencyId: "mehnat_inspeksiyasi",
  steps: [],
  agencies: [],
  escalation: [],
  legalReferences: [],
  templateId: "T12",
  reviewStatus: "DRAFT",
  reviewNotice: "Bu yo'l hali yurist tomonidan tekshirilmagan",
  requiresHumanReview: true,
  ...overrides,
});

describe("view mappings", () => {
  it("maps risk levels to UI tones", () => {
    expect(riskTone("red")).toBe("red");
    expect(riskTone("green")).toBe("green");
  });

  it("never labels a route as verified while human review is required", () => {
    expect(routeKind(decision({}))).toBeNull();
    expect(routeKind(decision({ routeType: "FALLBACK", routeId: null, problemId: null }))).toBe("generic");
    expect(routeKind(decision({ requiresHumanReview: false }))).toBe("verified");
    expect(routeKind(decision({ routeType: "EMERGENCY" }))).toBe("emergency");
  });

  it("maps submission status to text keys", () => {
    expect(statusKey("IN_REVIEW")).toBe("in_review");
  });

  it("splits catalog phone fields into tel: links without changing the text", () => {
    expect(phoneParts("1176; +998 71 200-06-00")).toEqual([
      { label: "1176", href: "tel:1176" },
      { label: "+998 71 200-06-00", href: "tel:+998712000600" },
    ]);
    expect(phoneParts("+998 71 207-97-37 (ishonch)")[0]?.href).toBe("tel:+998712079737");
  });

  it("distinguishes URLs from app names", () => {
    expect(isUrl("https://advice.uz")).toBe(true);
    expect(isUrl("Mening inspektorim ilovasi")).toBe(false);
  });

  it("lists catalog laws first and drops duplicates", () => {
    const ref = { documentId: null, documentName: "Mehnat kodeksi 253-modda", article: null, sourceUrl: null, status: "DRAFT", lastVerifiedAt: null } as const;
    const d = decision({ legalReferences: [ref] });
    expect(lawNames(d, [ref, { documentName: "Boshqa", article: "1" }])).toEqual(["Mehnat kodeksi 253-modda", "Boshqa, 1"]);
  });
});

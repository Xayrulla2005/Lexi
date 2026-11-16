import { describe, expect, it } from "vitest";
import type { RoutingDecision } from "@lex/contracts";
import { riskTone, routeKind, statusKey } from "./view";

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
    expect(routeKind(decision({}))).toBe("generic");
    expect(routeKind(decision({ requiresHumanReview: false }))).toBe("verified");
    expect(routeKind(decision({ routeType: "EMERGENCY" }))).toBe("emergency");
  });

  it("maps submission status to text keys", () => {
    expect(statusKey("IN_REVIEW")).toBe("in_review");
  });
});

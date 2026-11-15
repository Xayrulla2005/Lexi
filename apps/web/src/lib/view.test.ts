import { describe, expect, it } from "vitest";
import type { RoutingDecision } from "@lex/contracts";
import { riskTone, routeKind, statusKey } from "./view";

const decision = (overrides: Partial<RoutingDecision>): RoutingDecision => ({
  routeType: "RULE_BASED",
  routeId: "UNPAID_WAGES",
  agencyId: "mehnat_inspeksiyasi",
  steps: [],
  requiresHumanReview: true,
  ...overrides,
});

describe("view mappings", () => {
  it("maps risk levels to UI tones", () => {
    expect(riskTone("CRITICAL")).toBe("red");
    expect(riskTone("LOW")).toBe("green");
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

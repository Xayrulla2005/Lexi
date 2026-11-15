import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@lex/contracts";
import { createDefaultRoutingEngine, DeterministicRoutingEngine, PLACEHOLDER_ROUTES } from "../src";

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    schemaVersion: "1.0",
    caseSummary: "",
    classification: { domain: "mehnat", subcase: "UNPAID_WAGES", confidence: 0.9 },
    risk: { level: "NORMAL", signals: [], requiresImmediateAction: false },
    facts: [],
    missingInformation: [],
    legalReferences: [],
    followUpQuestions: [],
    needsHumanReview: false,
    ...overrides,
  };
}

describe("DeterministicRoutingEngine", () => {
  const engine = createDefaultRoutingEngine();

  it("routes a known sub-case to its rule-based route", () => {
    const { decision, matchedRuleId } = engine.route({ analysis: analysis() });
    expect(decision.routeType).toBe("RULE_BASED");
    expect(decision.routeId).toBe("UNPAID_WAGES");
    expect(matchedRuleId).toBe("rule.UNPAID_WAGES");
  });

  it("always requires human review while routes are PENDING", () => {
    expect(engine.route({ analysis: analysis() }).decision.requiresHumanReview).toBe(true);
  });

  it("emergency overrides any matching rule", () => {
    const risk: AnalysisResult["risk"] = { level: "CRITICAL", signals: ["pichoq"], requiresImmediateAction: true };
    const { decision } = engine.route({ analysis: analysis({ risk }) });
    expect(decision.routeType).toBe("EMERGENCY");
  });

  it("falls back when no rule matches", () => {
    const classification = { domain: "talim", subcase: null, confidence: 0.9 } as const;
    const { decision } = engine.route({ analysis: analysis({ classification }) });
    expect(decision.routeType).toBe("FALLBACK");
    expect(decision.routeId).toBeNull();
    expect(decision.requiresHumanReview).toBe(true);
  });

  it("is deterministic", () => {
    const ctx = { analysis: analysis() };
    expect(engine.route(ctx)).toEqual(engine.route(ctx));
  });

  it("never claims placeholder routes are verified", () => {
    for (const route of PLACEHOLDER_ROUTES) {
      expect(route.verification.status).not.toBe("VERIFIED");
      for (const step of route.steps) expect(step.deadlineDays).toBeNull();
    }
  });

  it("rejects rules that reference unknown routes", () => {
    const rule = {
      id: "r",
      description: "",
      priority: 1,
      routeId: "MISSING",
      matches: () => true,
      verification: { status: "PENDING", lastVerifiedAt: null, reviewer: null, sourceDocumentIds: [] },
    } as const;
    expect(() => new DeterministicRoutingEngine([rule], [])).toThrow(/unknown route/);
  });
});

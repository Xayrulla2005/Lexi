import { trustProxySetting } from "./http-hardening";
import { RATE_DEFAULTS, throttlers } from "./rate-limit";

describe("trustProxySetting", () => {
  it("is off by default and never 'trust everyone'", () => {
    expect(trustProxySetting(undefined)).toBe(false);
    expect(trustProxySetting("")).toBe(false);
    expect(trustProxySetting("false")).toBe(false);
    expect(() => trustProxySetting("true")).toThrow(/not allowed/);
  });

  it("accepts a hop count or proxy addresses", () => {
    expect(trustProxySetting("1")).toBe(1);
    expect(trustProxySetting("loopback, 10.0.0.0/8")).toBe("loopback, 10.0.0.0/8");
  });
});

describe("throttlers", () => {
  it("defaults, and env overrides must be positive integers", () => {
    const byName = Object.fromEntries(throttlers({}).map((t) => [t.name, t.limit]));
    expect(byName).toEqual({
      global: RATE_DEFAULTS.RATE_LIMIT_GLOBAL_PER_MIN,
      create: RATE_DEFAULTS.RATE_LIMIT_CREATE_PER_MIN,
      auth: RATE_DEFAULTS.RATE_LIMIT_AUTH_PER_MIN,
      ai: RATE_DEFAULTS.RATE_LIMIT_AI_PER_MIN,
      ai_conv: RATE_DEFAULTS.RATE_LIMIT_AI_CONVERSATION_PER_MIN,
      ai_all: RATE_DEFAULTS.RATE_LIMIT_AI_TOTAL_PER_MIN,
    });
    expect(throttlers({ RATE_LIMIT_AI_PER_MIN: "7" }).find((t) => t.name === "ai")?.limit).toBe(7);
    expect(() => throttlers({ RATE_LIMIT_AI_PER_MIN: "0" })).toThrow(/positive integer/);
    expect(() => throttlers({ RATE_LIMIT_AI_PER_MIN: "abc" })).toThrow(/positive integer/);
  });
});

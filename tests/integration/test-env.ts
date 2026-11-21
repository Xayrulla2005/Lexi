import { RATE_DEFAULTS } from "../../apps/api/src/common/rate-limit";

/**
 * Functional specs send many requests from one IP within a minute; they raise the rate limits
 * (env overrides read when the app module is compiled). rate-limit.spec.ts tests the real limits.
 */
export function relaxRateLimits(): void {
  for (const key of Object.keys(RATE_DEFAULTS)) process.env[key] = "100000";
}

export function restoreRateLimits(): void {
  for (const key of Object.keys(RATE_DEFAULTS)) delete process.env[key];
}

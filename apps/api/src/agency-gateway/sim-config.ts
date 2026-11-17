/**
 * Simulator timing, from env (never from legal sources).
 *
 * DEMO_SPEED        — optional. Milliseconds per simulated day (1000 = "1 day = 1 second").
 *                     Unset (default): MANUAL clock — simulated time moves only with the
 *                     cabinet button "⏩ Vaqtni oldinga surish (+15 kun)", nothing becomes
 *                     OVERDUE by itself. Set: AUTO clock, as before.
 * SIM_RESPONSE_DAYS — simulated response deadline in days (default 15). The catalog has no
 *                     agency deadlines, so this is a configuration value, NOT the legal term
 *                     from the law on appeals.
 */
export interface SimConfig {
  /** null = MANUAL clock. */
  msPerDay: number | null;
  responseDays: number;
}

/** Days added by one press of the cabinet button. */
export const ADVANCE_DAYS = 15;

function positive(name: string, raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number, got "${raw}"`);
  return n;
}

export function loadSimConfig(env: NodeJS.ProcessEnv = process.env): SimConfig {
  return {
    msPerDay: positive("DEMO_SPEED", env.DEMO_SPEED),
    responseDays: positive("SIM_RESPONSE_DAYS", env.SIM_RESPONSE_DAYS) ?? 15,
  };
}

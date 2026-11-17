/**
 * Simulator timing, from env (never from legal sources).
 *
 * DEMO_SPEED        — milliseconds per simulated day (default 86 400 000 = real time;
 *                     1000 means "1 day = 1 second").
 * SIM_RESPONSE_DAYS — simulated response deadline in days (default 15). The catalog has no
 *                     agency deadlines, so this is a configuration value, NOT the legal term
 *                     from the law on appeals.
 */
export interface SimConfig {
  msPerDay: number;
  responseDays: number;
}

function positive(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number, got "${raw}"`);
  return n;
}

export function loadSimConfig(env: NodeJS.ProcessEnv = process.env): SimConfig {
  return {
    msPerDay: positive("DEMO_SPEED", env.DEMO_SPEED, 86_400_000),
    responseDays: positive("SIM_RESPONSE_DAYS", env.SIM_RESPONSE_DAYS, 15),
  };
}

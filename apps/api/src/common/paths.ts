import { join, resolve } from "node:path";

/** Repository root; the same depth from src/common and dist/common. */
export const REPO_ROOT = resolve(__dirname, "../../../..");

/** Simulator fixtures (data/sim). Overridable for tests via SIM_DATA_DIR. */
export const simDataDir = (): string => process.env.SIM_DATA_DIR ?? join(REPO_ROOT, "data/sim");

/** Simulator key pairs (git-ignored). Overridable via SIM_KEYS_DIR. */
export const simKeysDir = (): string => process.env.SIM_KEYS_DIR ?? join(simDataDir(), "keys");

/**
 * File for persisted runtime state (data/runtime/<name>, git-ignored), or null for memory-only.
 * RUNTIME_DIR overrides the directory; under Jest (NODE_ENV=test) state is memory-only by default.
 */
export function runtimeFile(name: string): string | null {
  if (process.env.RUNTIME_DIR) return join(process.env.RUNTIME_DIR, name);
  if (process.env.NODE_ENV === "test") return null;
  return join(REPO_ROOT, "data/runtime", name);
}

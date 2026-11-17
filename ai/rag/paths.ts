import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Repository root, found by walking up to the folder that holds the legal catalog.
 * Works from ai/rag (tsx) and from ai/dist/rag (compiled, used by apps/api).
 * LEX_REPO_ROOT overrides it.
 */
export function repoRoot(start: string = __dirname): string {
  if (process.env.LEX_REPO_ROOT) return process.env.LEX_REPO_ROOT;
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "legal-knowledge", "catalog", "problems.json"))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`Repository root (legal-knowledge/catalog) not found above ${start}`);
    dir = up;
  }
}

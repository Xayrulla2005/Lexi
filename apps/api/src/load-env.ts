/**
 * Loads <repo root>/.env into process.env, whatever the working directory or build
 * output (src via tsx, dist via node). Must be the first import of main.ts so that
 * modules reading process.env at load time already see the values.
 * Real environment variables take precedence over the file (process.loadEnvFile does not override).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function findRepoRoot(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const root = findRepoRoot(__dirname);
const envFile = root ? join(root, ".env") : null;
if (envFile && existsSync(envFile)) process.loadEnvFile(envFile);

export const REPO_ENV_FILE = envFile;

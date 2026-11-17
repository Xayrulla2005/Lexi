import { Logger } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { withTimeout } from "./timeout";

let tmpCounter = 0;

/**
 * In-memory key/value store mirrored to a JSON file, so state survives an API restart.
 *
 * Writes:
 *  - atomic: a unique temp file is written, then renamed over the target;
 *  - serialized: one write at a time per store (a queue); changes made while a write
 *    is running are coalesced into the next write;
 *  - non-blocking: `set` updates memory immediately; callers that need durability
 *    await `persist()`, which is bounded by the operation timeout (never waits forever).
 *
 * A file that fails validation at startup is ignored (logged), never partially loaded.
 */
export class JsonStore<T> {
  private readonly logger = new Logger(JsonStore.name);
  private readonly items = new Map<string, T>();
  private dirty = false;
  private pending: Promise<void> | null = null;

  constructor(
    private readonly file: string | null,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ) {
    if (!file || !existsSync(file)) return;
    try {
      // Startup only: a synchronous read before the server accepts requests.
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      const parsed = z.record(z.string(), schema).safeParse(raw);
      if (parsed.success) for (const [k, v] of Object.entries(parsed.data)) this.items.set(k, v);
      else this.logger.warn(`${file} ignored: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    } catch (e) {
      this.logger.warn(`${file} ignored: ${(e as Error).message}`);
    }
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  set(id: string, value: T): T {
    this.items.set(id, value);
    this.schedule();
    return value;
  }

  values(): T[] {
    return [...this.items.values()];
  }

  /** Resolves once every change made so far is on disk; rejects with "Qayta urinib ko'ring" after the timeout. */
  persist(operation = "store.persist"): Promise<void> {
    if (!this.file || !this.pending) return Promise.resolve();
    return withTimeout(this.pending, `${operation}:${basename(this.file)}`);
  }

  private schedule(): void {
    if (!this.file) return;
    this.dirty = true;
    if (this.pending) return; // the running drain picks this change up
    const run = this.drain().finally(() => {
      this.pending = null;
    });
    // Background writes must not crash the process; errors are logged and surfaced via persist().
    run.catch((e: unknown) => this.logger.error(`write ${this.file} failed: ${(e as Error).message}`));
    this.pending = run;
  }

  private async drain(): Promise<void> {
    const file = this.file as string;
    while (this.dirty) {
      this.dirty = false;
      const data = JSON.stringify(Object.fromEntries(this.items), null, 2);
      await mkdir(dirname(file), { recursive: true });
      const tmp = join(dirname(file), `.${basename(file)}.${process.pid}.${++tmpCounter}.tmp`);
      await writeFile(tmp, data);
      await rename(tmp, file);
    }
  }
}

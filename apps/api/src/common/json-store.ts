import { Logger } from "@nestjs/common";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

/**
 * In-memory key/value store mirrored to a JSON file, so state survives an API restart.
 * Every write rewrites the file atomically (tmp + rename) — fine for demo volumes.
 * A file that fails validation is ignored (logged), never partially loaded.
 */
export class JsonStore<T> {
  private readonly logger = new Logger(JsonStore.name);
  private readonly items = new Map<string, T>();

  constructor(
    private readonly file: string | null,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ) {
    if (!file || !existsSync(file)) return;
    try {
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
    this.flush();
    return value;
  }

  values(): T[] {
    return [...this.items.values()];
  }

  private flush(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.items), null, 2));
    renameSync(tmp, this.file);
  }
}

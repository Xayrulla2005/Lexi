/**
 * Eval-only response cache: identical prompt + options + model -> stored reply.
 * Lets the free-tier quota be spent once; re-runs are offline. ai/eval/cache/ is git-ignored.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatCompletionOptions, ChatMessage, ChatModelProvider } from "../models/provider";

export interface CacheStats {
  hits: number;
  misses: number;
  /** Latency of live (non-cached) calls, ms. */
  liveLatencies: number[];
}

export class CachingProvider implements ChatModelProvider {
  readonly id: string;
  readonly stats: CacheStats = { hits: 0, misses: 0, liveLatencies: [] };

  constructor(
    private readonly inner: ChatModelProvider,
    private readonly dir: string,
  ) {
    this.id = inner.id ?? "unknown";
    mkdirSync(dir, { recursive: true });
  }

  async complete(messages: readonly ChatMessage[], options: ChatCompletionOptions = {}): Promise<string> {
    const key = createHash("sha256").update(JSON.stringify({ id: this.id, messages, options })).digest("hex");
    const file = join(this.dir, `${key}.json`);
    if (existsSync(file)) {
      this.stats.hits++;
      return (JSON.parse(readFileSync(file, "utf8")) as { reply: string }).reply;
    }
    this.stats.misses++;
    const t0 = performance.now();
    const reply = await this.inner.complete(messages, options);
    this.stats.liveLatencies.push(Math.round(performance.now() - t0));
    writeFileSync(file, JSON.stringify({ reply }));
    return reply;
  }
}

/**
 * Google Gemini via the official SDK (@google/genai).
 *
 * - model from GEMINI_MODEL, key from GEMINI_API_KEY (process.env only; never logged);
 * - temperature 0 by default, JSON output (optionally with a JSON schema);
 * - 20 s timeout per attempt;
 * - 5xx: up to 3 retries with exponential backoff; 429: wait 30 s, then retry (up to 3 times);
 * - at most 2 requests in flight per process (free tier), shared by all instances.
 * User text is never logged.
 */
import { ApiError, GoogleGenAI } from "@google/genai";
import type { ChatCompletionOptions, ChatMessage, ChatModelProvider } from "./provider";
import { ProviderNotConfiguredError } from "./provider";

export interface GeminiConfig {
  apiKey: string | undefined;
  model: string | undefined;
  timeoutMs?: number;
  /** Max concurrent requests (process-wide). */
  maxConcurrent?: number;
  /** Wait after HTTP 429. */
  rateLimitWaitMs?: number;
  /** First backoff for 5xx; doubles each retry. */
  backoffMs?: number;
  maxRetries?: number;
}

/** Response fields used here. Text is read from the parts directly: the SDK's `text` getter warns about thought parts. */
export interface GenAiResponse {
  text?: string | undefined;
  candidates?: { content?: { parts?: { text?: string | undefined; thought?: boolean | undefined }[] | undefined } | undefined }[] | undefined;
}

/** Only the answer text: thought parts and non-text parts (thoughtSignature) are skipped. */
export function responseText(res: GenAiResponse): string {
  const parts = res.candidates?.[0]?.content?.parts;
  if (parts) return parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("");
  return res.text ?? "";
}

/** Minimal surface of the SDK used here (injectable for tests). */
export interface GenAiModels {
  generateContent(params: {
    model: string;
    contents: { role: "user" | "model"; parts: { text: string }[] }[];
    config: {
      systemInstruction?: string;
      temperature?: number;
      maxOutputTokens?: number;
      responseMimeType?: string;
      responseJsonSchema?: unknown;
      abortSignal?: AbortSignal;
    };
  }): Promise<GenAiResponse>;
}

export class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "GeminiRequestError";
  }
}

/** Process-wide semaphore so parallel callers never exceed the free-tier limit. */
class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
const semaphores = new Map<number, Semaphore>();
const semaphoreFor = (n: number): Semaphore => {
  let s = semaphores.get(n);
  if (!s) {
    s = new Semaphore(n);
    semaphores.set(n, s);
  }
  return s;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function statusOf(e: unknown): number | null {
  if (e instanceof ApiError) return e.status;
  const s = (e as { status?: unknown }).status;
  return typeof s === "number" ? s : null;
}

/** 429 with a longer suggested delay than this is a quota, not a burst limit. */
const MAX_USEFUL_RETRY_DELAY_S = 60;

/** Reads google.rpc.RetryInfo.retryDelay ("7583s") from the error message; 0 when absent. */
function retryDelaySeconds(e: unknown): number {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(String((e as Error).message ?? ""));
  return m ? Number(m[1]) : 0;
}

export class GeminiProvider implements ChatModelProvider {
  readonly id: string;
  private readonly models: GenAiModels;
  private readonly cfg: Required<Omit<GeminiConfig, "apiKey" | "model">> & { model: string };

  constructor(config: GeminiConfig, models?: GenAiModels, private readonly wait: (ms: number) => Promise<void> = sleep) {
    if (!config.apiKey) throw new ProviderNotConfiguredError("GEMINI_API_KEY");
    if (!config.model) throw new ProviderNotConfiguredError("GEMINI_MODEL");
    this.cfg = {
      model: config.model,
      timeoutMs: config.timeoutMs ?? 20_000,
      maxConcurrent: config.maxConcurrent ?? 2,
      rateLimitWaitMs: config.rateLimitWaitMs ?? 30_000,
      backoffMs: config.backoffMs ?? 1_000,
      maxRetries: config.maxRetries ?? 3,
    };
    this.id = `gemini:${config.model}`;
    this.models = models ?? (new GoogleGenAI({ apiKey: config.apiKey }).models as unknown as GenAiModels);
  }

  complete(messages: readonly ChatMessage[], options: ChatCompletionOptions = {}): Promise<string> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? ("model" as const) : ("user" as const), parts: [{ text: m.content }] }));
    return semaphoreFor(this.cfg.maxConcurrent).run(() => this.withRetries(system, contents, options));
  }

  private async withRetries(
    system: string,
    contents: Parameters<GenAiModels["generateContent"]>[0]["contents"],
    options: ChatCompletionOptions,
  ): Promise<string> {
    let rateLimited = 0;
    let serverErrors = 0;
    for (;;) {
      try {
        const res = await this.models.generateContent({
          model: this.cfg.model,
          contents,
          config: {
            ...(system ? { systemInstruction: system } : {}),
            temperature: options.temperature ?? 0,
            ...(options.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
            ...(options.json || options.jsonSchema ? { responseMimeType: "application/json" } : {}),
            ...(options.jsonSchema ? { responseJsonSchema: options.jsonSchema } : {}),
            abortSignal: AbortSignal.timeout(this.cfg.timeoutMs),
          },
        });
        const text = responseText(res);
        if (!text) throw new GeminiRequestError("Gemini returned an empty response", null);
        return text;
      } catch (e) {
        const status = statusOf(e);
        // A daily quota (retryDelay of minutes/hours) will not recover in 30 s: fail fast.
        if (status === 429 && retryDelaySeconds(e) > MAX_USEFUL_RETRY_DELAY_S) {
          throw new GeminiRequestError("Gemini quota exhausted (daily limit); retry later", 429);
        }
        if (status === 429 && rateLimited < this.cfg.maxRetries) {
          rateLimited++;
          await this.wait(this.cfg.rateLimitWaitMs);
          continue;
        }
        if (status !== null && status >= 500 && serverErrors < this.cfg.maxRetries) {
          await this.wait(this.cfg.backoffMs * 2 ** serverErrors);
          serverErrors++;
          continue;
        }
        if (e instanceof GeminiRequestError) throw e;
        const name = (e as Error).name;
        const reason = name === "TimeoutError" || name === "AbortError" ? `timeout after ${this.cfg.timeoutMs} ms` : `HTTP ${status ?? "?"}`;
        // Never include the request (user text) or the key in the error.
        throw new GeminiRequestError(`Gemini request failed: ${reason}`, status);
      }
    }
  }
}

export function geminiFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): GeminiProvider {
  return new GeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
}

/**
 * Thin Hugging Face Inference client (chat, embeddings, speech-to-text).
 *
 * STATUS: foundation only. Not yet exercised against the live API and not
 * wired into analyze(); no network call happens unless a caller invokes it
 * with a configured HF_TOKEN. Endpoints follow the HF Inference Providers
 * router; confirm them against current HF docs before enabling.
 */
import type { EmbeddingProvider } from "../rag/interfaces";
import type { ModelConfig } from "./config";
import {
  ProviderNotConfiguredError,
  type ChatCompletionOptions,
  type ChatMessage,
  type ChatModelProvider,
  type SpeechToTextProvider,
} from "./provider";

const ROUTER = "https://router.huggingface.co";

type FetchFn = typeof fetch;

export class HuggingFaceProvider implements ChatModelProvider, EmbeddingProvider, SpeechToTextProvider {
  readonly dimensions = 1024; // BGE-M3 dense vector size

  constructor(
    private readonly config: ModelConfig,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async complete(messages: readonly ChatMessage[], options: ChatCompletionOptions = {}): Promise<string> {
    const body = {
      model: this.config.chatModel,
      messages,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? 1500,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    };
    const res = (await this.post(`${ROUTER}/v1/chat/completions`, JSON.stringify(body), "application/json")) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = res.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Hugging Face chat response has no content");
    return content;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    const url = `${ROUTER}/hf-inference/models/${this.config.embeddingModel}/pipeline/feature-extraction`;
    const res = await this.post(url, JSON.stringify({ inputs: texts }), "application/json");
    if (!Array.isArray(res)) throw new Error("Unexpected embedding response");
    return res as number[][];
  }

  async transcribe(audio: Blob): Promise<{ text: string }> {
    const url = `${ROUTER}/hf-inference/models/${this.config.sttModel}`;
    const res = (await this.post(url, audio, audio.type || "application/octet-stream")) as { text?: string };
    if (typeof res.text !== "string") throw new Error("Unexpected speech-to-text response");
    return { text: res.text };
  }

  private async post(url: string, body: string | Blob, contentType: string): Promise<unknown> {
    if (!this.config.hfToken) throw new ProviderNotConfiguredError("Hugging Face");
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.hfToken}`, "content-type": contentType },
      body,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    if (!res.ok) throw new Error(`Hugging Face request failed: ${res.status} ${res.statusText}`);
    return res.json();
  }
}

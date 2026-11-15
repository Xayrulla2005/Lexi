/**
 * Model configuration. Values come from environment variables only —
 * tokens are never hardcoded or committed.
 */
export interface ModelConfig {
  /** Hugging Face access token. Optional: absent in CI and offline development. */
  hfToken: string | undefined;
  /** Chat/instruction model used for structured analysis (Qwen family). */
  chatModel: string;
  /** Embedding model for RAG (BGE-M3, 1024-dim dense vectors). */
  embeddingModel: string;
  /** Optional speech-to-text model (Whisper). */
  sttModel: string;
  /** Sampling temperature for analysis; kept low for reproducible structured output. */
  temperature: number;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
}

export const DEFAULT_MODELS = {
  chatModel: "Qwen/Qwen2.5-7B-Instruct",
  embeddingModel: "BAAI/bge-m3",
  sttModel: "openai/whisper-large-v3",
} as const;

export function loadModelConfig(env: Readonly<Record<string, string | undefined>> = process.env): ModelConfig {
  return {
    hfToken: env.HF_TOKEN || undefined,
    chatModel: env.HF_MODEL || DEFAULT_MODELS.chatModel,
    embeddingModel: env.HF_EMBEDDING_MODEL || DEFAULT_MODELS.embeddingModel,
    sttModel: env.HF_STT_MODEL || DEFAULT_MODELS.sttModel,
    temperature: 0.1,
    timeoutMs: 30_000,
  };
}

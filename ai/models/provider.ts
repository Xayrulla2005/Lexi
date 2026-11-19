/** Provider-agnostic model interfaces. Implementations live next to this file. */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  /** Ask the provider for a JSON object response when supported. */
  json?: boolean;
  /** JSON Schema the reply must follow (structured output) when the provider supports it. */
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatModelProvider {
  /** "<backend>:<model>", used in logs, caches and eval reports (never contains secrets). */
  readonly id?: string;
  /** Returns the raw text of the model reply. Callers must validate it (never trust model output). */
  complete(messages: readonly ChatMessage[], options?: ChatCompletionOptions): Promise<string>;
}

export interface SpeechToTextProvider {
  /** `audio.type` must be the audio MIME type (e.g. "audio/ogg"). */
  transcribe(audio: Blob): Promise<{ text: string }>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(what: string) {
    super(`${what} is not configured (set it in .env)`);
    this.name = "ProviderNotConfiguredError";
  }
}

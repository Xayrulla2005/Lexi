/** Provider-agnostic model interfaces. Implementations live next to this file. */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  /** Ask the provider for a JSON object response when supported. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatModelProvider {
  /** Returns the raw text of the model reply. Callers must validate it (never trust model output). */
  complete(messages: readonly ChatMessage[], options?: ChatCompletionOptions): Promise<string>;
}

export interface SpeechToTextProvider {
  /** `audio.type` must be the audio MIME type (e.g. "audio/ogg"). */
  transcribe(audio: Blob): Promise<{ text: string }>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(what: string) {
    super(`${what} is not configured (set HF_TOKEN in .env)`);
    this.name = "ProviderNotConfiguredError";
  }
}

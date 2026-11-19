/**
 * Chooses the chat model from LLM_PROVIDER = gemini | huggingface | keyword (default keyword).
 * Missing keys never throw here: the caller gets null and uses the keyword classifier
 * (the analysis is then marked degraded).
 */
import { geminiFromEnv } from "./gemini.provider";
import { loadModelConfig } from "./config";
import { HuggingFaceProvider } from "./huggingface.provider";
import type { ChatModelProvider } from "./provider";

export type LlmProviderName = "gemini" | "huggingface" | "keyword";

export function llmProviderName(env: Readonly<Record<string, string | undefined>> = process.env): LlmProviderName {
  const v = (env.LLM_PROVIDER ?? "").trim().toLowerCase();
  return v === "gemini" || v === "huggingface" ? v : "keyword";
}

export interface ProviderChoice {
  name: LlmProviderName;
  provider: ChatModelProvider | null;
  /** Why the provider is unavailable (no secrets in it); null when available or keyword. */
  unavailable: string | null;
}

export function selectChatProvider(env: Readonly<Record<string, string | undefined>> = process.env): ProviderChoice {
  const name = llmProviderName(env);
  if (name === "keyword") return { name, provider: null, unavailable: null };
  try {
    if (name === "gemini") return { name, provider: geminiFromEnv(env), unavailable: null };
    const cfg = loadModelConfig(env);
    if (!cfg.hfToken) return { name, provider: null, unavailable: "HF_TOKEN is not set" };
    return { name, provider: new HuggingFaceProvider(cfg), unavailable: null };
  } catch (e) {
    return { name, provider: null, unavailable: (e as Error).message };
  }
}

let cached: { key: string; choice: ProviderChoice } | null = null;

/** Process-wide provider for the current env (re-created only when LLM_PROVIDER/model change). */
export function defaultChatProvider(env: Readonly<Record<string, string | undefined>> = process.env): ProviderChoice {
  const key = `${llmProviderName(env)}|${env.GEMINI_MODEL ?? ""}|${env.HF_MODEL ?? ""}|${env.GEMINI_API_KEY ? 1 : 0}|${env.HF_TOKEN ? 1 : 0}`;
  if (!cached || cached.key !== key) cached = { key, choice: selectChatProvider(env) };
  return cached.choice;
}

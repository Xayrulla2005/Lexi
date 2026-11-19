/** XAYRULLA: API bilan aloqa. Dilfuza bu faylga tegmaydi. */
import type { Case, Conversation, RiskLevel } from "@lex/contracts";

const API = process.env.API_URL ?? "http://localhost:3001";

async function call<T>(path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Maps contract risk levels to the keys used in texts.uz.ts (identical today; explicit so contract changes fail typecheck). */
export const RISK_TONE: Record<RiskLevel, "red" | "orange" | "yellow" | "green"> = {
  red: "red",
  orange: "orange",
  yellow: "yellow",
  green: "green",
};

export const api = {
  createCase: (userId: string) => call<Case>("/cases", { channel: "bot", userId }),
  addMessage: (id: string, text: string) => call(`/cases/${id}/messages`, { text }),
  analyze: (id: string) => call<Case>(`/cases/${id}/analyze`, {}),
  /** Lexi conversation (same engine as the web). */
  startConversation: () => call<Conversation>("/conversations", { channel: "bot" }),
  getConversation: (id: string) => call<Conversation>(`/conversations/${id}`),
  say: (id: string, text: string) => call<Conversation>(`/conversations/${id}/messages`, { text }),
  act: (id: string, action: string) => call<Conversation>(`/conversations/${id}/actions`, { action }),
};

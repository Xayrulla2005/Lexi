/** XAYRULLA: API bilan aloqa. Dilfuza bu faylga tegmaydi. */
import {
  CONVERSATION_TOKEN_HEADER,
  type Conversation,
  type ConversationHandoff,
  type RiskLevel,
  type StartedConversation,
} from "@lex/contracts";

const API = process.env.API_URL ?? "http://localhost:3001";

async function call<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const method = body ? "POST" : "GET";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers[CONVERSATION_TOKEN_HEADER] = token;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
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

/** Lexi conversation (same engine as the web). Every call after start needs the conversation's access token. */
export const api = {
  startConversation: () => call<StartedConversation>("/conversations", { channel: "bot" }),
  getConversation: (id: string, token: string) => call<Conversation>(`/conversations/${id}`, undefined, token),
  say: (id: string, token: string, text: string) => call<Conversation>(`/conversations/${id}/messages`, { text }, token),
  act: (id: string, token: string, action: string) => call<Conversation>(`/conversations/${id}/actions`, { action }, token),
  /** One-time code for the "open on the web" link; the token itself never leaves the bot. */
  handoff: (id: string, token: string) => call<ConversationHandoff>(`/conversations/${id}/handoff`, {}, token),
};

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Conversation } from "@lex/contracts";
import { hashSecret, newSecret } from "../common/secrets";

/** Access tokens live this long; a new one comes only from /claim (handoff) or a new conversation. */
export const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
/** Bot -> web handoff codes: single use, short lived. */
export const HANDOFF_TTL_MS = 15 * 60 * 1000;
/** Bounded so a client cannot grow a record without limit. */
const MAX_TOKENS = 10;
const MAX_HANDOFFS = 5;

const IsoDate = z.string().datetime({ offset: true });

/** Only the SHA-256 of a secret is stored; the secret itself is shown to the client once. */
const SecretRecord = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: IsoDate,
  expiresAt: IsoDate,
  /** Token: revoked (logout). Handoff code: used. */
  revokedAt: IsoDate.nullable(),
});
type SecretRecord = z.infer<typeof SecretRecord>;

const Record_ = z.object({
  conversation: Conversation,
  tokens: z.array(SecretRecord).default([]),
  handoffs: z.array(SecretRecord).default([]),
});

/**
 * Stored conversation: the conversation plus its access secrets (hashes only).
 * Records written before access tokens existed (a bare Conversation) are read as
 * `{ conversation, tokens: [] }`: they stay reachable only by their bound citizen.
 */
export const StoredConversation = z.preprocess(
  (raw) => (raw && typeof raw === "object" && !("conversation" in raw) ? { conversation: raw } : raw),
  Record_,
);
export type StoredConversation = z.infer<typeof Record_>;

function matches(record: SecretRecord, secret: string, now: number): boolean {
  if (record.revokedAt || Date.parse(record.expiresAt) <= now) return false;
  const a = Buffer.from(record.hash, "hex");
  const b = Buffer.from(hashSecret(secret), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const live = (list: readonly SecretRecord[], now: number): SecretRecord[] =>
  list.filter((r) => !r.revokedAt && Date.parse(r.expiresAt) > now);

/** Adds a new secret; returns it (plaintext, for the client) and the updated list (hashes). */
export function issue(list: readonly SecretRecord[], ttlMs: number, max: number, now = Date.now()): { secret: string; expiresAt: string; list: SecretRecord[] } {
  const secret = newSecret();
  const expiresAt = new Date(now + ttlMs).toISOString();
  const record: SecretRecord = { hash: hashSecret(secret), createdAt: new Date(now).toISOString(), expiresAt, revokedAt: null };
  return { secret, expiresAt, list: [...live(list, now), record].slice(-max) };
}

export const issueToken = (s: StoredConversation, now = Date.now()) => issue(s.tokens, TOKEN_TTL_MS, MAX_TOKENS, now);
export const issueHandoff = (s: StoredConversation, now = Date.now()) => issue(s.handoffs, HANDOFF_TTL_MS, MAX_HANDOFFS, now);

export const validSecret = (list: readonly SecretRecord[], secret: string | undefined, now = Date.now()): boolean =>
  !!secret && list.some((r) => matches(r, secret, now));

/** Marks the matching secret revoked/used. Returns null if none matched. */
export function revoke(list: readonly SecretRecord[], secret: string, now = Date.now()): SecretRecord[] | null {
  let hit = false;
  const next = list.map((r) => {
    if (!hit && matches(r, secret, now)) {
      hit = true;
      return { ...r, revokedAt: new Date(now).toISOString() };
    }
    return r;
  });
  return hit ? next : null;
}

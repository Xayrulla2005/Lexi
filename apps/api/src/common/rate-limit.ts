import { type ExecutionContext, Module, SetMetadata } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule, type ThrottlerOptions } from "@nestjs/throttler";

/**
 * Rate limits (in-memory, per API process). Several buckets apply at once; a request that
 * exceeds any of them gets 429 with Retry-After.
 *
 *   global       every route, per client IP
 *   create       anonymous creation (POST /conversations, POST /cases), per IP
 *   auth         logins and handoff claims (simulator logins, /claim), per IP
 *   ai           routes that may call the LLM or the embedding model, per IP
 *   ai_conv      the same routes, per conversation (one conversation cannot burn the quota)
 *   ai_all       the same routes, all clients together: a process-wide AI budget
 *
 * The client IP is req.ip: X-Forwarded-For is trusted only when TRUST_PROXY is set
 * (see http-hardening.ts), so a client cannot dodge limits with a forged header.
 * NOTE: the storage is this process's memory — several API instances do NOT share limits.
 */

export type RateClass = "create" | "auth" | "ai";
const RATE_CLASS = "lex:rate-class";

/** Marks a route for the stricter buckets of these classes. */
export const RateLimit = (...classes: RateClass[]) => SetMetadata(RATE_CLASS, classes);

const classesOf = (ctx: ExecutionContext): RateClass[] =>
  (Reflect.getMetadata(RATE_CLASS, ctx.getHandler()) as RateClass[] | undefined) ??
  (Reflect.getMetadata(RATE_CLASS, ctx.getClass()) as RateClass[] | undefined) ??
  [];
const unless = (c: RateClass) => (ctx: ExecutionContext) => !classesOf(ctx).includes(c);

const MINUTE = 60_000;

/** Per-minute limits; env overrides (positive integers) exist for operations and tests. */
export const RATE_DEFAULTS = {
  RATE_LIMIT_GLOBAL_PER_MIN: 240,
  RATE_LIMIT_CREATE_PER_MIN: 10,
  RATE_LIMIT_AUTH_PER_MIN: 10,
  RATE_LIMIT_AI_PER_MIN: 20,
  RATE_LIMIT_AI_CONVERSATION_PER_MIN: 15,
  RATE_LIMIT_AI_TOTAL_PER_MIN: 120,
} as const;
type RateKey = keyof typeof RATE_DEFAULTS;

function limit(env: NodeJS.ProcessEnv, key: RateKey): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return RATE_DEFAULTS[key];
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${key} must be a positive integer, got "${raw}"`);
  return n;
}

const ip = (req: Record<string, unknown>): string => String(req.ip ?? "unknown");

/**
 * One bucket per (throttler, tracker), shared by every route of that class — e.g. both login
 * routes share "auth", and messages and actions of one conversation share "ai_conv".
 * (The library default would keep a separate bucket per route.)
 */
const sharedKey = (_ctx: ExecutionContext, tracker: string, name: string): string => `${name}:${tracker}`;

export function throttlers(env: NodeJS.ProcessEnv = process.env): ThrottlerOptions[] {
  return buckets(env).map((t) => ({ ...t, generateKey: sharedKey }));
}

function buckets(env: NodeJS.ProcessEnv): ThrottlerOptions[] {
  return [
    { name: "global", ttl: MINUTE, limit: limit(env, "RATE_LIMIT_GLOBAL_PER_MIN"), getTracker: ip },
    { name: "create", ttl: MINUTE, limit: limit(env, "RATE_LIMIT_CREATE_PER_MIN"), getTracker: ip, skipIf: unless("create") },
    // Logins: a short block after the limit slows down passcode guessing.
    { name: "auth", ttl: MINUTE, limit: limit(env, "RATE_LIMIT_AUTH_PER_MIN"), blockDuration: 5 * MINUTE, getTracker: ip, skipIf: unless("auth") },
    { name: "ai", ttl: MINUTE, limit: limit(env, "RATE_LIMIT_AI_PER_MIN"), getTracker: ip, skipIf: unless("ai") },
    {
      name: "ai_conv",
      ttl: MINUTE,
      limit: limit(env, "RATE_LIMIT_AI_CONVERSATION_PER_MIN"),
      // Routes without a :id param (none today) fall back to the IP.
      getTracker: (req) => {
        const id = (req.params as Record<string, string> | undefined)?.id;
        return id ? `conv:${id}` : ip(req);
      },
      skipIf: unless("ai"),
    },
    { name: "ai_all", ttl: MINUTE, limit: limit(env, "RATE_LIMIT_AI_TOTAL_PER_MIN"), getTracker: () => "all", skipIf: unless("ai") },
  ];
}

/** User-facing 429 text (Uzbek, latin). */
export const RATE_LIMIT_MESSAGE = "Juda ko'p so'rov. Birozdan keyin qayta urinib ko'ring.";

/** Global guard: runs before every controller guard (auth, ownership). */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => ({ throttlers: throttlers(), errorMessage: RATE_LIMIT_MESSAGE }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}

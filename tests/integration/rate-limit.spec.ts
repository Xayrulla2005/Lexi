/**
 * Phase 3: rate limits, security headers, body size limits and trust-proxy handling,
 * through the same hardening as main.ts (hardenHttp). No network, keys or database.
 */
import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { getArticlesForProblem } from "@lex/ai";
import type { StartedConversation } from "@lex/contracts";
import { AppModule } from "../../apps/api/src/app.module";
import { hardenHttp } from "../../apps/api/src/common/http-hardening";
import { RATE_DEFAULTS, RATE_LIMIT_MESSAGE } from "../../apps/api/src/common/rate-limit";
import { ARTICLE_RETRIEVER } from "../../apps/api/src/llm/llm.module";

const T = "x-conversation-token";
const XFF = "x-forwarded-for";
const KEYS = [...Object.keys(RATE_DEFAULTS), "SIM_MODE", "TRUST_PROXY", "SIM_KEYS_DIR", "DATABASE_URL", "LLM_PROVIDER"];

async function startApp(env: Record<string, string>): Promise<INestApplication<App>> {
  for (const k of KEYS) delete process.env[k];
  process.env.SIM_KEYS_DIR = mkdtempSync(join(tmpdir(), "lex-keys-"));
  Object.assign(process.env, env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ARTICLE_RETRIEVER)
    .useValue(async (_story: string, problemId: string | null) => (problemId ? getArticlesForProblem(problemId) : []))
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  hardenHttp(app);
  await app.init();
  return app as unknown as INestApplication<App>;
}

function suite(name: string, env: Record<string, string>, body: (http: () => ReturnType<typeof request>) => void) {
  describe(name, () => {
    let app: INestApplication<App>;
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    beforeAll(async () => {
      app = await startApp(env);
    });
    afterAll(async () => {
      await app.close();
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });
    body(() => request(app.getHttpServer()));
  });
}

const start = async (http: () => ReturnType<typeof request>, ip?: string): Promise<StartedConversation> => {
  const r = http().post("/conversations");
  return (await (ip ? r.set(XFF, ip) : r).send({ channel: "web" }).expect(201)).body as StartedConversation;
};
const say = (http: () => ReturnType<typeof request>, c: StartedConversation, text: string, ip?: string) => {
  const r = http().post(`/conversations/${c.conversation.id}/messages`).set(T, c.access.token);
  return (ip ? r.set(XFF, ip) : r).send({ text });
};

suite("Security headers and body limits", { SIM_MODE: "true" }, (http) => {
  it("helmet headers on every response; no X-Powered-By", async () => {
    const res = await http().get("/health").expect(200);
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    // Errors carry them too.
    const err = await http().get("/conversations/8c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11").expect(401);
    expect(err.headers["content-security-policy"]).toContain("default-src 'none'");
  });

  it("JSON body over 64kb -> 413 before any handler; within the limit the contract still applies", async () => {
    const c = await start(http);
    await say(http, c, "x".repeat(70 * 1024)).expect(413);
    await say(http, c, "x".repeat(6000)).expect(400); // contract: max 5000 chars
  });

  it("rate-limit headers are sent", async () => {
    const res = await http().get("/health").expect(200);
    expect(res.headers["x-ratelimit-limit-global"]).toBe(String(RATE_DEFAULTS.RATE_LIMIT_GLOBAL_PER_MIN));
  });
});

suite("Anonymous creation and logins (default limits)", { SIM_MODE: "true" }, (http) => {
  it(`conversation creation: ${RATE_DEFAULTS.RATE_LIMIT_CREATE_PER_MIN}/min per IP, then 429 with Retry-After`, async () => {
    for (let i = 0; i < RATE_DEFAULTS.RATE_LIMIT_CREATE_PER_MIN; i++) await start(http);
    const res = await http().post("/conversations").send({ channel: "web" }).expect(429);
    expect(res.body.message).toBe(RATE_LIMIT_MESSAGE);
    expect(Number(res.headers["retry-after-create"] ?? res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("a forged X-Forwarded-For does not reset the limit (TRUST_PROXY unset)", async () => {
    await http().post("/conversations").set(XFF, "203.0.113.77").send({ channel: "web" }).expect(429);
  });

  it(`simulator logins: ${RATE_DEFAULTS.RATE_LIMIT_AUTH_PER_MIN}/min per IP`, async () => {
    for (let i = 0; i < RATE_DEFAULTS.RATE_LIMIT_AUTH_PER_MIN; i++) {
      await http().post("/sim/oneid/login").send({ citizenId: "test_fuqaro_1" }).expect(201);
    }
    await http().post("/sim/oneid/login").send({ citizenId: "test_fuqaro_1" }).expect(429);
    await http().post("/sim/idora/login").send({ agencyId: "mehnat_inspeksiyasi" }).expect(429); // same auth bucket
  });

  it("non-AI reads are not affected by the stricter buckets", async () => {
    await http().get("/health").expect(200);
  });
});

suite(
  "AI routes: per conversation and per IP (behind a proxy)",
  { TRUST_PROXY: "1", RATE_LIMIT_AI_CONVERSATION_PER_MIN: "3", RATE_LIMIT_AI_PER_MIN: "5", RATE_LIMIT_CREATE_PER_MIN: "100" },
  (http) => {
    it("one conversation: 3 messages per minute, the 4th is 429", async () => {
      const c = await start(http, "198.51.100.1");
      for (let i = 0; i < 3; i++) await say(http, c, i === 0 ? "3 oydan beri oylik berishmayapti" : "Bilmayman", "198.51.100.1").expect(200);
      await say(http, c, "Bilmayman", "198.51.100.1").expect(429);
    });

    it("one client IP: 5 AI requests per minute across its conversations", async () => {
      const ip = "198.51.100.2";
      const a = await start(http, ip);
      const b = await start(http, ip);
      for (let i = 0; i < 3; i++) await say(http, a, "salom", ip).expect(200);
      for (let i = 0; i < 2; i++) await say(http, b, "salom", ip).expect(200);
      await say(http, b, "salom", ip).expect(429);
      // TRUST_PROXY=1: a different client behind the proxy has its own bucket.
      const c = await start(http, "198.51.100.3");
      await say(http, c, "salom", "198.51.100.3").expect(200);
    });

    it("AI actions count too", async () => {
      const ip = "198.51.100.4";
      const c = await start(http, ip);
      for (let i = 0; i < 3; i++) {
        const r = http().post(`/conversations/${c.conversation.id}/actions`).set(T, c.access.token).set(XFF, ip);
        await r.send({ action: "call_cancel" }).expect(200);
      }
      await http().post(`/conversations/${c.conversation.id}/actions`).set(T, c.access.token).set(XFF, ip).send({ action: "call_cancel" }).expect(429);
    });
  },
);

suite(
  "AI routes: process-wide budget",
  { TRUST_PROXY: "1", RATE_LIMIT_AI_TOTAL_PER_MIN: "4", RATE_LIMIT_CREATE_PER_MIN: "100" },
  (http) => {
    it("all clients together: the 5th AI request in a minute is 429, whatever the IP", async () => {
      for (let i = 1; i <= 4; i++) {
        const ip = `192.0.2.${i}`;
        await say(http, await start(http, ip), "salom", ip).expect(200);
      }
      const ip = "192.0.2.99";
      await say(http, await start(http, ip), "salom", ip).expect(429);
    });
  },
);

/**
 * Security regression tests (Security Gate 1): conversation access and ownership, session
 * takeover, citizen ownership, SIM_MODE gating, simulator cabinet authentication, PDF access
 * and the removed legacy simulator route. No network, keys or database.
 */
import "reflect-metadata";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { getArticlesForProblem } from "@lex/ai";
import type { Conversation, StartedConversation } from "@lex/contracts";
import { AppModule } from "../../apps/api/src/app.module";
import { hashSecret } from "../../apps/api/src/common/secrets";
import { ARTICLE_RETRIEVER } from "../../apps/api/src/llm/llm.module";
import { relaxRateLimits } from "./test-env";

const H = "x-sim-session";
const T = "x-conversation-token";
const A = "x-sim-agency-session";
const MANUAL = { malumot_1: "Hisobchi", malumot_2: "Namuna MChJ", malumot_3: "sentabr", summa: "5 000 000" };
const ENV_KEYS = ["SIM_MODE", "RUNTIME_DIR", "SIM_KEYS_DIR", "DATABASE_URL", "DEMO_SPEED", "SIM_AGENCY_PASSCODE"] as const;

async function startApp(env: Partial<Record<(typeof ENV_KEYS)[number], string>>): Promise<INestApplication<App>> {
  for (const k of ENV_KEYS) delete process.env[k];
  relaxRateLimits();
  process.env.SIM_KEYS_DIR = mkdtempSync(join(tmpdir(), "lex-keys-"));
  Object.assign(process.env, env);
  // Catalog articles only: no embedding model in tests.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ARTICLE_RETRIEVER)
    .useValue(async (_story: string, problemId: string | null) => (problemId ? getArticlesForProblem(problemId) : []))
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}

describe("Security (SIM_MODE=true)", () => {
  let app: INestApplication<App>;
  let runtimeDir: string;
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    runtimeDir = mkdtempSync(join(tmpdir(), "lex-runtime-"));
    app = await startApp({ SIM_MODE: "true", RUNTIME_DIR: runtimeDir });
  });
  afterAll(async () => {
    await app.close();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const login = async (citizenId: string): Promise<string> =>
    (await http().post("/sim/oneid/login").send({ citizenId }).expect(201)).body.token as string;
  const officer = async (agencyId: string): Promise<string> =>
    (await http().post("/sim/idora/login").send({ agencyId }).expect(201)).body.token as string;
  const start = async (): Promise<StartedConversation> =>
    (await http().post("/conversations").send({ channel: "web" }).expect(201)).body as StartedConversation;

  /** A signed and submitted P12 application of `citizen`. */
  async function submitted(citizen: string) {
    const token = await login(citizen);
    const { body: c } = await http().post("/cases").set(H, token).send({ channel: "web" }).expect(201);
    await http().post(`/cases/${c.id}/messages`).set(H, token).send({ text: "3 oydan beri oylik berishmayapti" }).expect(201);
    await http().post(`/cases/${c.id}/analyze`).set(H, token).expect(200);
    const { body: draft } = await http().post(`/cases/${c.id}/application`).set(H, token).expect(201);
    await http().patch(`/applications/${draft.id}/fields`).set(H, token).send({ values: MANUAL }).expect(200);
    await http().post(`/applications/${draft.id}/consent`).set(H, token).send({ consent: true }).expect(201);
    await http().post(`/applications/${draft.id}/sign`).set(H, token).expect(201);
    const { body: sub } = await http().post("/submissions").set(H, token).send({ applicationId: draft.id, consent: true }).expect(201);
    return { token, caseId: c.id as string, appId: draft.id as string, subId: sub.id as string };
  }

  describe("conversation access by id", () => {
    it("the id alone opens nothing: no credentials 401, wrong or foreign token 404", async () => {
      const a = await start();
      const b = await start();
      const id = a.conversation.id;
      await http().get(`/conversations/${id}`).expect(401);
      await http().post(`/conversations/${id}/messages`).send({ text: "salom" }).expect(401);
      await http().post(`/conversations/${id}/actions`).send({ action: "offer_yes" }).expect(401);
      await http().get(`/conversations/${id}`).set(T, "x".repeat(43)).expect(404);
      await http().get(`/conversations/${id}`).set(T, id).expect(404); // the UUID is not a secret
      await http().get(`/conversations/${id}`).set(T, b.access.token).expect(404);
      const { body } = await http().get(`/conversations/${id}`).set(T, a.access.token).expect(200);
      expect((body as Conversation).id).toBe(id);
    });

    it("the access token is opaque, not the id, and only its hash is stored", async () => {
      const a = await start();
      expect(a.access.token).not.toContain(a.conversation.id);
      expect(a.access.token.length).toBeGreaterThanOrEqual(43);
      expect(Date.parse(a.access.expiresAt)).toBeGreaterThan(Date.now());
      await http().get(`/conversations/${a.conversation.id}`).set(T, a.access.token).expect(200); // flushes the store
      const file = readFileSync(join(runtimeDir, "conversations.json"), "utf8");
      expect(file).not.toContain(a.access.token);
      expect(file).toContain(hashSecret(a.access.token));
    });

    it("a revoked token stops working", async () => {
      const a = await start();
      const id = a.conversation.id;
      await http().post(`/conversations/${id}/logout`).set(T, a.access.token).expect(204);
      await http().get(`/conversations/${id}`).set(T, a.access.token).expect(404);
    });

    it("handoff code: single use, gives a new token, wrong code 404", async () => {
      const a = await start();
      const id = a.conversation.id;
      await http().post(`/conversations/${id}/handoff`).expect(401);
      const { body: h } = await http().post(`/conversations/${id}/handoff`).set(T, a.access.token).expect(200);
      await http().post(`/conversations/${id}/claim`).send({ code: "y".repeat(43) }).expect(404);
      const { body: claimed } = await http().post(`/conversations/${id}/claim`).send({ code: h.code }).expect(200);
      expect(claimed.token).not.toBe(a.access.token);
      await http().get(`/conversations/${id}`).set(T, claimed.token).expect(200);
      await http().post(`/conversations/${id}/claim`).send({ code: h.code }).expect(404); // used
    });
  });

  describe("session takeover", () => {
    it("a conversation is bound once; another citizen's session cannot read, write or rebind it", async () => {
      const a = await start();
      const id = a.conversation.id;
      const alice = await login("test_fuqaro_1");
      const bob = await login("test_fuqaro_2");

      // Bound only when the request proves possession (token) AND has a session.
      await http().get(`/conversations/${id}`).set(H, alice).expect(404);
      const { body: bound } = await http().get(`/conversations/${id}`).set(T, a.access.token).set(H, alice).expect(200);
      expect(bound.citizenId).toBe("test_fuqaro_1");

      // The owner's session alone is enough now.
      await http().get(`/conversations/${id}`).set(H, alice).expect(200);

      // Bob: with or without the token, cannot read, write, act or take it over.
      await http().get(`/conversations/${id}`).set(H, bob).expect(403);
      await http().get(`/conversations/${id}`).set(H, bob).set(T, a.access.token).expect(403);
      await http().post(`/conversations/${id}/messages`).set(H, bob).set(T, a.access.token).send({ text: "salom" }).expect(403);
      await http().post(`/conversations/${id}/actions`).set(H, bob).set(T, a.access.token).send({ action: "offer_yes" }).expect(403);
      await http().post(`/conversations/${id}/handoff`).set(H, bob).set(T, a.access.token).expect(403);

      const { body: still } = await http().get(`/conversations/${id}`).set(H, alice).expect(200);
      expect(still.citizenId).toBe("test_fuqaro_1");
    });

    it("a session never comes from the body: unknown session header = anonymous", async () => {
      const a = await start();
      const { body } = await http()
        .get(`/conversations/${a.conversation.id}`)
        .set(T, a.access.token)
        .set(H, "00000000-0000-4000-8000-000000000000")
        .expect(200);
      expect(body.citizenId).toBeNull();
      await http().post("/cases").send({ channel: "web", userId: "test_fuqaro_1" }).expect(401);
    });
  });

  describe("citizen ownership", () => {
    it("another citizen gets 403 on the case, application, PDF and submission status", async () => {
      const { caseId, appId, subId } = await submitted("test_fuqaro_1");
      const bob = await login("test_fuqaro_2");
      await http().get(`/cases/${caseId}`).set(H, bob).expect(403);
      await http().post(`/cases/${caseId}/messages`).set(H, bob).send({ text: "x" }).expect(403);
      await http().post(`/cases/${caseId}/analyze`).set(H, bob).expect(403);
      await http().post(`/cases/${caseId}/application`).set(H, bob).expect(403);
      await http().get(`/applications/${appId}`).set(H, bob).expect(403);
      await http().get(`/applications/${appId}/pdf`).set(H, bob).expect(403);
      await http().get(`/applications/${appId}/pdf`).expect(401);
      await http().get(`/submissions/${subId}`).set(H, bob).expect(403);
      await http().post("/submissions").set(H, bob).send({ applicationId: appId, consent: true }).expect(403);
    });
  });

  describe("simulator cabinet authentication", () => {
    it("no session 401; a citizen session is not a cabinet session; another agency 403", async () => {
      const { token: citizen, subId } = await submitted("test_fuqaro_1");
      const mi = await officer("mehnat_inspeksiyasi");
      const other = await officer("prokuratura");

      for (const path of ["/sim/idora/mehnat_inspeksiyasi/inbox", "/sim/idora/iiv/calls", `/sim/idora/submissions/${subId}`]) {
        await http().get(path).expect(401);
        await http().get(path).set(H, citizen).expect(401);
      }
      await http().post(`/sim/idora/submissions/${subId}/status`).send({ status: "RECEIVED" }).expect(401);
      await http().post(`/sim/idora/submissions/${subId}/respond`).send({ text: "x" }).expect(401);
      await http().post(`/sim/idora/submissions/${subId}/advance`).expect(401);

      await http().get("/sim/idora/mehnat_inspeksiyasi/inbox").set(A, other).expect(403);
      await http().get(`/sim/idora/submissions/${subId}`).set(A, other).expect(403);
      await http().post(`/sim/idora/submissions/${subId}/status`).set(A, other).send({ status: "RECEIVED" }).expect(403);
      await http().post(`/sim/idora/submissions/${subId}/respond`).set(A, other).send({ text: "x" }).expect(403);
      await http().post(`/sim/idora/submissions/${subId}/advance`).set(A, other).expect(403);

      const { body: item } = await http().get(`/sim/idora/submissions/${subId}`).set(A, mi).expect(200);
      expect(item.submission.id).toBe(subId);
      await http().post("/sim/idora/login").send({ agencyId: "no_such_agency" }).expect(401);
    });

    it("PDF: only the addressed agency's officer", async () => {
      const { subId } = await submitted("test_fuqaro_1");
      await http().get(`/sim/idora/submissions/${subId}/pdf`).expect(401);
      await http().get(`/sim/idora/submissions/${subId}/pdf`).set(A, await officer("iiv")).expect(403);
      const ok = await http().get(`/sim/idora/submissions/${subId}/pdf`).set(A, await officer("mehnat_inspeksiyasi")).expect(200);
      expect(ok.headers["content-type"]).toContain("application/pdf");
    });

    it("the login picker shows names only (no PINFL, phone or address)", async () => {
      const { body } = await http().get("/sim/oneid/citizens").expect(200);
      expect(body[0]).toEqual({ id: "test_fuqaro_1", fio: expect.any(String), simulated: true });
    });

    it("legacy /simulator route is gone", async () => {
      await http().get("/simulator/mehnat_inspeksiyasi/submissions").expect(404);
    });
  });
});

describe("Security (SIM_MODE off — default)", () => {
  let app: INestApplication<App>;
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await startApp({});
  });
  afterAll(async () => {
    await app.close();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("every simulator route is 404", async () => {
    await http().get("/sim/oneid/citizens").expect(404);
    await http().post("/sim/oneid/login").send({ citizenId: "test_fuqaro_1" }).expect(404);
    await http().get("/sim/oneid/session").expect(404);
    await http().get("/sim/idora/agencies").expect(404);
    await http().get("/sim/idora/clock").expect(404);
    await http().post("/sim/idora/login").send({ agencyId: "mehnat_inspeksiyasi" }).expect(404);
    await http().get("/sim/idora/mehnat_inspeksiyasi/inbox").expect(404);
    await http().get("/sim/idora/iiv/calls").expect(404);
    await http().get("/simulator/mehnat_inspeksiyasi/submissions").expect(404);
  });

  it("no identity provider: protected routes are 401 (deny by default)", async () => {
    await http().post("/cases").send({ channel: "web" }).expect(401);
    await http().get("/applications").expect(401);
    await http().post("/submissions").send({ applicationId: "8c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11", consent: true }).expect(401);
  });

  it("anonymous conversations still work with their token; no simulated emergency dispatch", async () => {
    const started = (await http().post("/conversations").send({ channel: "web" }).expect(201)).body as StartedConversation;
    const id = started.conversation.id;
    const { body } = await http().post(`/conversations/${id}/messages`).set(T, started.access.token).send({ text: "erim pichoq bilan o'ldiraman deyapti" }).expect(200);
    const emergency = (body as Conversation).messages.find((m) => m.card?.type === "emergency");
    expect(emergency?.actions.some((a) => a.kind === "tel")).toBe(true);
    expect(emergency?.actions.some((a) => a.value.startsWith("call:"))).toBe(false);
    await http().post(`/conversations/${id}/actions`).set(T, started.access.token).send({ action: "call:iiv" }).expect(400);
  });
});

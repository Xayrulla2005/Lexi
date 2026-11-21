/**
 * Phase 8.8–8.12: professional authorization (SIMULATOR lawyer cabinet), cross-citizen and
 * cross-professional access, lifecycle with 409s, parallel decisions, audit, simulator isolation.
 */
import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import type { AssignedConsultation, ConsultationRequest } from "@lex/contracts";
import { AppModule } from "../../apps/api/src/app.module";
import { AuditService } from "../../apps/api/src/audit/audit.service";
import { ARTICLE_RETRIEVER } from "../../apps/api/src/llm/llm.module";
import { catalogRetriever, relaxRateLimits } from "./test-env";

const H = "x-sim-session";
const P = "x-sim-professional-session";
const KEYS = ["SIM_MODE", "RUNTIME_DIR", "SIM_KEYS_DIR", "DATABASE_URL", "SIM_PROFESSIONAL_PASSCODE"] as const;

async function startApp(env: Record<string, string>): Promise<INestApplication<App>> {
  for (const k of KEYS) delete process.env[k];
  relaxRateLimits();
  Object.assign(process.env, { SIM_KEYS_DIR: mkdtempSync(join(tmpdir(), "lex-keys-")) }, env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ARTICLE_RETRIEVER).useValue(catalogRetriever).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}

describe("Lawyer cabinet (SIM_MODE=true)", () => {
  let app: INestApplication<App>;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    app = await startApp({ SIM_MODE: "true" });
  });
  afterAll(async () => {
    await app.close();
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const citizen = async (id: string) => (await http().post("/sim/oneid/login").send({ citizenId: id }).expect(201)).body.token as string;
  const pro = async (id: string) => (await http().post("/sim/professionals/login").send({ professionalId: id }).expect(201)).body.token as string;
  const request_ = async (token: string, professionalId = "test_yurist_1") =>
    (await http().post("/consultations").set(H, token).send({ professionalId, message: "Maslahat kerak.", consent: true }).expect(201)).body as ConsultationRequest;
  const decide = (token: string, id: string, action: string) => http().post(`/sim/professionals/consultations/${id}/decision`).set(P, token).send({ action });

  it("login: listed demo professionals only; citizen tokens are not professional sessions", async () => {
    await http().post("/sim/professionals/login").send({ professionalId: "test_yurist_3" }).expect(401); // INACTIVE
    await http().post("/sim/professionals/login").send({ professionalId: "nobody" }).expect(401);
    const c = await citizen("test_fuqaro_1");
    await http().get("/sim/professionals/consultations").expect(401);
    await http().get("/sim/professionals/consultations").set(P, c).expect(401);
    await http().get("/sim/professionals/consultations").set(H, c).expect(401);
  });

  it("a professional sees only assigned consultations, without the citizen's identity", async () => {
    const c = await citizen("test_fuqaro_1");
    const mine = await request_(c, "test_yurist_1");
    const theirs = await request_(c, "test_advokat_1");
    const y1 = await pro("test_yurist_1");
    const { body: list } = (await http().get("/sim/professionals/consultations").set(P, y1).expect(200)) as { body: AssignedConsultation[] };
    expect(list.map((x) => x.id)).toContain(mine.id);
    expect(list.map((x) => x.id)).not.toContain(theirs.id);
    expect(JSON.stringify(list)).not.toContain("test_fuqaro_1");
    await http().get(`/sim/professionals/consultations/${theirs.id}`).set(P, y1).expect(403);
    await http().get("/sim/professionals/consultations/8c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11").set(P, y1).expect(404);
  });

  it("cross-professional and cross-citizen changes are refused; the ID in the URL grants nothing", async () => {
    const c = await citizen("test_fuqaro_1");
    const other = await citizen("test_fuqaro_2");
    const x = await request_(c, "test_yurist_1");
    const a1 = await pro("test_advokat_1");
    await decide(a1, x.id, "accept").expect(403);
    await decide(a1, x.id, "decline").expect(403);
    await http().post(`/consultations/${x.id}/cancel`).set(H, other).expect(403);
    await http().get(`/consultations/${x.id}`).set(H, other).expect(403);
    // Role is never taken from the body.
    await http().post(`/sim/professionals/consultations/${x.id}/decision`).set(P, a1).send({ action: "accept", professionalId: "test_yurist_1" }).expect(403);
    const { body: still } = await http().get(`/consultations/${x.id}`).set(H, c).expect(200);
    expect(still.status).toBe("REQUESTED");
  });

  it("lifecycle: accept -> complete; invalid transitions 409; citizen cannot cancel a completed one", async () => {
    const c = await citizen("test_fuqaro_1");
    const x = await request_(c);
    const y1 = await pro("test_yurist_1");
    await decide(y1, x.id, "complete").expect(409); // not accepted yet
    await decide(y1, x.id, "bogus").expect(400);
    const { body: acc } = await decide(y1, x.id, "accept").expect(200);
    expect(acc.status).toBe("ACCEPTED");
    await decide(y1, x.id, "decline").expect(409);
    await decide(y1, x.id, "complete").expect(200);
    await http().post(`/consultations/${x.id}/cancel`).set(H, c).expect(409);
    const { body: final } = await http().get(`/consultations/${x.id}`).set(H, c).expect(200);
    expect(final.history.map((h: { status: string; by: string }) => `${h.status}:${h.by}`)).toEqual([
      "REQUESTED:citizen",
      "ACCEPTED:professional",
      "COMPLETED:professional",
    ]);

    const events = app.get(AuditService).find((e) => e.data.consultationId === x.id);
    expect(events.map((e) => [e.type, e.data.to ?? null])).toEqual([
      ["CONSULTATION_REQUESTED", null],
      ["CONSULTATION_STATUS_CHANGED", "ACCEPTED"],
      ["CONSULTATION_STATUS_CHANGED", "COMPLETED"],
    ]);
    expect(JSON.stringify(events)).not.toContain("Maslahat kerak.");
  });

  it("parallel decisions: exactly one wins, the rest 409; decline and cancel race likewise", async () => {
    const c = await citizen("test_fuqaro_1");
    const x = await request_(c);
    const y1 = await pro("test_yurist_1");
    const results = await Promise.all([decide(y1, x.id, "accept"), decide(y1, x.id, "decline"), decide(y1, x.id, "accept")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);

    const z = await request_(c);
    const race = await Promise.all([decide(y1, z.id, "decline"), http().post(`/consultations/${z.id}/cancel`).set(H, c)]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("logout ends the professional session", async () => {
    const y1 = await pro("test_yurist_1");
    await http().post("/sim/professionals/logout").set(P, y1).expect(204);
    await http().get("/sim/professionals/consultations").set(P, y1).expect(401);
  });

  it("verification: no endpoint raises a profile's status (BLOCKED without admin auth)", async () => {
    await http().post("/professionals/test_yurist_1/verify").send({ status: "VERIFIED" }).expect(404);
    await http().post("/sim/professionals/test_yurist_1/verify").send({ status: "VERIFIED" }).expect(404);
    const { body } = await http().get("/professionals/test_yurist_1").expect(200);
    expect(body.verificationStatus).not.toBe("VERIFIED");
    expect(body.simulated).toBe(true);
  });
});

describe("Lawyer cabinet (SIM_MODE off)", () => {
  let app: INestApplication<App>;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  beforeAll(async () => {
    app = await startApp({});
  });
  afterAll(async () => {
    await app.close();
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("the simulator lawyer cabinet does not exist", async () => {
    await request(app.getHttpServer()).post("/sim/professionals/login").send({ professionalId: "test_yurist_1" }).expect(404);
    await request(app.getHttpServer()).get("/sim/professionals/consultations").expect(404);
  });
});

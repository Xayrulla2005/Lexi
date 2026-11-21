/**
 * Phase 8: legal marketplace (MVP) — directory (SIM_MODE only, never auto-verified), search,
 * recommendation for the citizen's own case, consultation requests and their lifecycle.
 */
import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import type { ConsultationRequest, LegalProfessional } from "@lex/contracts";
import { AppModule } from "../../apps/api/src/app.module";
import { MarketplaceService } from "../../apps/api/src/marketplace/marketplace.service";
import { relaxRateLimits } from "./test-env";

const H = "x-sim-session";
const KEYS = ["SIM_MODE", "RUNTIME_DIR", "SIM_KEYS_DIR", "DATABASE_URL"] as const;

async function startApp(env: Record<string, string>): Promise<INestApplication<App>> {
  for (const k of KEYS) delete process.env[k];
  relaxRateLimits();
  Object.assign(process.env, { SIM_KEYS_DIR: mkdtempSync(join(tmpdir(), "lex-keys-")) }, env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}

describe("Marketplace (SIM_MODE=true)", () => {
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
  const login = async (citizenId: string) => (await http().post("/sim/oneid/login").send({ citizenId }).expect(201)).body.token as string;

  it("directory: active, not auto-verified, filter by domain and region; inactive hidden", async () => {
    const { body: all } = (await http().get("/professionals").expect(200)) as { body: LegalProfessional[] };
    expect(all.length).toBe(4);
    expect(all.every((p) => p.simulated && p.verificationStatus !== "VERIFIED")).toBe(true);
    expect(all.map((p) => p.id)).not.toContain("test_yurist_3"); // INACTIVE
    const { body: mehnat } = await http().get("/professionals?domain=mehnat").expect(200);
    expect(mehnat.map((p: LegalProfessional) => p.id)).toEqual(["test_yurist_1"]);
    const { body: sam } = await http().get(`/professionals?region=${encodeURIComponent("samarqand")}`).expect(200);
    expect(sam.map((p: LegalProfessional) => p.id)).toEqual(["test_yurist_2"]);
    await http().get("/professionals?domain=not_a_domain").expect(400);
    await http().get("/professionals/test_advokat_1").expect(200);
    await http().get("/professionals/test_yurist_3").expect(404);
    await http().get("/professionals/..%2F..%2Fetc").expect(400);
  });

  it("recommendation for the citizen's own case (by its classified domain); others' cases 403", async () => {
    const token = await login("test_fuqaro_1");
    const { body: c } = await http().post("/cases").set(H, token).send({ channel: "web" }).expect(201);
    await http().post(`/cases/${c.id}/messages`).set(H, token).send({ text: "3 oydan beri oylik berishmayapti" }).expect(201);
    await http().post(`/cases/${c.id}/analyze`).set(H, token).expect(200);
    const { body: rec } = await http().get(`/professionals?caseId=${c.id}`).set(H, token).expect(200);
    expect(rec.map((p: LegalProfessional) => p.id)).toEqual(["test_yurist_1"]);
    await http().get(`/professionals?caseId=${c.id}`).expect(401);
    const other = await login("test_fuqaro_2");
    await http().get(`/professionals?caseId=${c.id}`).set(H, other).expect(403);
  });

  it("consultation: consent required, owner-only, lifecycle and audit without the message", async () => {
    const token = await login("test_fuqaro_1");
    const body = { professionalId: "test_yurist_1", message: "Oylik masalasida maslahat kerak." };
    await http().post("/consultations").send({ ...body, consent: true }).expect(401);
    await http().post("/consultations").set(H, token).send(body).expect(400);
    await http().post("/consultations").set(H, token).send({ ...body, professionalId: "test_yurist_3", consent: true }).expect(404);
    const { body: created } = (await http().post("/consultations").set(H, token).send({ ...body, consent: true }).expect(201)) as { body: ConsultationRequest };
    expect(created.status).toBe("REQUESTED");

    const other = await login("test_fuqaro_2");
    await http().get(`/consultations/${created.id}`).set(H, other).expect(403);
    await http().post(`/consultations/${created.id}/cancel`).set(H, other).expect(403);
    const { body: list } = await http().get("/consultations").set(H, other).expect(200);
    expect(list).toEqual([]);
    // Linking someone else's case is refused.
    const { body: foreignCase } = await http().post("/cases").set(H, other).send({ channel: "web" }).expect(201);
    await http().post("/consultations").set(H, token).send({ ...body, caseId: foreignCase.id, consent: true }).expect(403);

    // Professional side (service; no professional accounts over HTTP yet).
    const market = app.get(MarketplaceService);
    await expect(market.transition(created.id, "ACCEPTED", { by: "professional", professionalId: "test_advokat_1" })).rejects.toMatchObject({ status: 403 });
    await expect(market.transition(created.id, "ACCEPTED", { by: "citizen", citizenId: "test_fuqaro_1" })).rejects.toMatchObject({ status: 403 });
    await market.transition(created.id, "ACCEPTED", { by: "professional", professionalId: "test_yurist_1" });
    await expect(market.transition(created.id, "DECLINED", { by: "professional", professionalId: "test_yurist_1" })).rejects.toMatchObject({ status: 409 });

    const { body: cancelled } = await http().post(`/consultations/${created.id}/cancel`).set(H, token).expect(200);
    expect(cancelled.history.map((h: { status: string }) => h.status)).toEqual(["REQUESTED", "ACCEPTED", "CANCELLED"]);
    await http().post(`/consultations/${created.id}/cancel`).set(H, token).expect(409);
  });
});

describe("Marketplace (SIM_MODE off)", () => {
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

  it("no fictional professionals outside the simulator; consultations need authentication", async () => {
    const { body } = await request(app.getHttpServer()).get("/professionals").expect(200);
    expect(body).toEqual([]);
    await request(app.getHttpServer()).get("/professionals/test_yurist_1").expect(404);
    await request(app.getHttpServer()).get("/consultations").expect(401);
  });
});

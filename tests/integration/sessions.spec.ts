/**
 * Phase 6: session lifecycle over HTTP — logout, logout-all, rotation, and authentication
 * bypass attempts (cookie, query string, body, malformed header).
 */
import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { AppModule } from "../../apps/api/src/app.module";
import { relaxRateLimits } from "./test-env";

const H = "x-sim-session";
const KEYS = ["SIM_MODE", "RUNTIME_DIR", "SIM_KEYS_DIR", "DATABASE_URL"] as const;

describe("Sessions (Phase 6, OneID SIMULATOR)", () => {
  let app: INestApplication<App>;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    for (const k of KEYS) delete process.env[k];
    relaxRateLimits();
    Object.assign(process.env, { SIM_MODE: "true", SIM_KEYS_DIR: mkdtempSync(join(tmpdir(), "lex-keys-")) });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const login = async (citizenId: string, previous?: string) => {
    const r = http().post("/sim/oneid/login");
    return (await (previous ? r.set(H, previous) : r).send({ citizenId }).expect(201)).body as { token: string; expiresAt: string };
  };

  it("session has an expiry; logout revokes it (401 afterwards)", async () => {
    const s = await login("test_fuqaro_1");
    expect(Date.parse(s.expiresAt)).toBeGreaterThan(Date.now());
    await http().get("/applications").set(H, s.token).expect(200);
    await http().post("/sim/oneid/logout").set(H, s.token).expect(204);
    await http().get("/applications").set(H, s.token).expect(401);
    await http().get("/sim/oneid/session").set(H, s.token).expect(401);
  });

  it("login with a current session rotates it", async () => {
    const old = await login("test_fuqaro_1");
    const fresh = await login("test_fuqaro_1", old.token);
    expect(fresh.token).not.toBe(old.token);
    await http().get("/applications").set(H, old.token).expect(401);
    await http().get("/applications").set(H, fresh.token).expect(200);
  });

  it("logout-all ends every session of the citizen only", async () => {
    const a = await login("test_fuqaro_2");
    const b = await login("test_fuqaro_2");
    const other = await login("test_fuqaro_3");
    await http().post("/sim/oneid/logout-all").set(H, a.token).expect(204);
    await http().get("/applications").set(H, a.token).expect(401);
    await http().get("/applications").set(H, b.token).expect(401);
    await http().get("/applications").set(H, other.token).expect(200);
    await http().post("/sim/oneid/logout-all").expect(401);
  });

  it("the token is accepted only in its header: not from a cookie, query string or body", async () => {
    const s = await login("test_fuqaro_1");
    await http().get("/applications").set("Cookie", `${H}=${s.token}`).expect(401);
    await http().get(`/applications?${H}=${s.token}`).expect(401);
    await http().post("/cases").send({ channel: "web", token: s.token, [H]: s.token }).expect(401);
    await http().get("/applications").set("Authorization", `Bearer ${s.token}`).expect(401);
    await http().get("/applications").set(H, `${s.token}x`).expect(401);
    await http().get("/applications").set(H, "' OR 1=1 --").expect(401);
  });
});

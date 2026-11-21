import { UnauthorizedException } from "@nestjs/common";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashSecret } from "../common/secrets";
import { OneIdSimulatorService, SESSION_IDLE_MS, SESSION_TTL_MS } from "./oneid.service";

describe("OneIdSimulatorService (SIMULATOR)", () => {
  const oneId = new OneIdSimulatorService();

  it("lists exactly the 3 fictional test citizens with fake PINFLs", () => {
    const list = oneId.listCitizens();
    expect(list).toHaveLength(3);
    for (const c of list) {
      expect(c.simulated).toBe(true);
      expect(c.pinfl).toMatch(/^0{13}\d$/);
    }
  });

  it("logs in and resolves the session by an opaque token", async () => {
    const s = await oneId.login("test_fuqaro_1");
    expect(s.token.length).toBeGreaterThanOrEqual(43);
    expect(oneId.session(s.token).citizen.fio).toBe(s.citizen.fio);
  });

  it("rejects missing or unknown tokens", () => {
    expect(() => oneId.session(undefined)).toThrow(UnauthorizedException);
    expect(() => oneId.session("00000000-0000-4000-8000-000000000000")).toThrow(UnauthorizedException);
  });

  it("expires: absolute lifetime and inactivity", async () => {
    const t0 = Date.parse("2026-11-21T08:00:00Z");
    const s = await oneId.login("test_fuqaro_1", undefined, t0);
    // Active use keeps it alive until the absolute limit.
    for (let t = t0; t < t0 + SESSION_TTL_MS; t += SESSION_IDLE_MS / 2) expect(oneId.find(s.token, t)).not.toBeNull();
    expect(oneId.find(s.token, t0 + SESSION_TTL_MS)).toBeNull();
    const idle = await oneId.login("test_fuqaro_1", undefined, t0);
    expect(oneId.find(idle.token, t0 + SESSION_IDLE_MS)).toBeNull();
  });

  it("logout revokes one token; logout-all revokes every session of the citizen; login rotates", async () => {
    const a = await oneId.login("test_fuqaro_2");
    const b = await oneId.login("test_fuqaro_2");
    expect(oneId.revoke(a.token)).toBe(true);
    expect(oneId.find(a.token)).toBeNull();
    expect(oneId.find(b.token)).not.toBeNull();
    expect(oneId.revoke(a.token)).toBe(false);

    const c = await oneId.login("test_fuqaro_2", b.token); // rotation
    expect(oneId.find(b.token)).toBeNull();
    expect(oneId.find(c.token)).not.toBeNull();
    expect(oneId.revokeAll("test_fuqaro_2")).toBeGreaterThanOrEqual(1);
    expect(oneId.find(c.token)).toBeNull();
  });

  it("stores only the token hash", async () => {
    const saved = process.env.RUNTIME_DIR;
    process.env.RUNTIME_DIR = mkdtempSync(join(tmpdir(), "lex-oneid-"));
    try {
      const svc = new OneIdSimulatorService();
      const s = await svc.login("test_fuqaro_3");
      const file = readFileSync(join(process.env.RUNTIME_DIR, "oneid-sessions.json"), "utf8");
      expect(file).not.toContain(s.token);
      expect(file).toContain(hashSecret(s.token));
      expect(file).not.toContain("pinfl");
    } finally {
      if (saved === undefined) delete process.env.RUNTIME_DIR;
      else process.env.RUNTIME_DIR = saved;
    }
  });
});

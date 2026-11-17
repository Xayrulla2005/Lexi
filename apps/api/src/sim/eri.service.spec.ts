import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EriSimulatorService } from "./eri.service";

describe("EriSimulatorService (SIMULATOR)", () => {
  const keysDir = mkdtempSync(join(tmpdir(), "lex-eri-"));
  const prev = process.env.SIM_KEYS_DIR;
  beforeAll(() => {
    process.env.SIM_KEYS_DIR = keysDir;
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.SIM_KEYS_DIR;
    else process.env.SIM_KEYS_DIR = prev;
  });

  const pdf = Buffer.from("%PDF-1.3\nAriza matni: O‘zbekiston\n%%EOF");

  it("creates a test key pair on first use", async () => {
    await new EriSimulatorService().sign("test_fuqaro_1", pdf);
    expect(existsSync(join(keysDir, "test_fuqaro_1.key.pem"))).toBe(true);
    expect(existsSync(join(keysDir, "test_fuqaro_1.pub.pem"))).toBe(true);
  });

  it("unchanged PDF -> \"Imzo haqiqiy\"", async () => {
    const eri = new EriSimulatorService();
    const sig = await eri.sign("test_fuqaro_1", pdf);
    expect(sig).toMatchObject({ algorithm: "Ed25519", hashAlgorithm: "SHA-256", simulated: true });
    expect(await eri.verify(pdf, sig)).toEqual({ valid: true, message: "Imzo haqiqiy" });
    // A fresh instance reloads the same key from disk.
    expect((await new EriSimulatorService().verify(pdf, sig)).valid).toBe(true);
  });

  it("one byte changed -> \"Imzo buzilgan\"", async () => {
    const eri = new EriSimulatorService();
    const sig = await eri.sign("test_fuqaro_1", pdf);
    const tampered = Buffer.from(pdf);
    tampered[10] = (tampered[10] as number) ^ 0x01;
    expect(await eri.verify(tampered, sig)).toEqual({ valid: false, message: "Imzo buzilgan" });
  });

  it("rejects a signature whose key was swapped for another citizen's", async () => {
    const eri = new EriSimulatorService();
    const sig = await eri.sign("test_fuqaro_2", pdf);
    expect((await eri.verify(pdf, { ...sig, signerCitizenId: "test_fuqaro_1" })).message).toBe("Imzo buzilgan");
    expect((await eri.verify(pdf, { ...sig, signature: Buffer.alloc(64).toString("base64") })).message).toBe("Imzo buzilgan");
  });
});

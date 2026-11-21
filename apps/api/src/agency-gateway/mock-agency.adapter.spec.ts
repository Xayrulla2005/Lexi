import type { AgencyContact, SubmissionPackage } from "@lex/contracts";
import { LegalRoutingService } from "../legal-routing/legal-routing.service";
import { MockAgencyAdapter } from "./mock-agency.adapter";

/** Real catalog, except one agency gets a catalog deadline (javob_muddati = 10). */
class RoutingWithDeadline extends LegalRoutingService {
  override agencies(): AgencyContact[] {
    return super.agencies().map((a) => (a.id === "mehnat_inspeksiyasi" ? { ...a, responseDays: 10 } : a));
  }
}

const pkg = (agencyId: string, agencyName: string): SubmissionPackage => ({
  applicationId: "8c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11",
  caseId: "8c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c12",
  agencyId,
  agencyName,
  pdfBase64: "JVBERi0=",
  signature: {
    simulated: true,
    algorithm: "Ed25519",
    hashAlgorithm: "SHA-256",
    digest: "0".repeat(64),
    signature: "AA==",
    publicKey: "test",
    signerCitizenId: "test_fuqaro_1",
    signedAt: new Date().toISOString(),
  },
  caseInfo: { caseId: "8c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c12", problemId: "P12", title: null, facts: [], fields: {} },
  consentAt: new Date().toISOString(),
  documents: [],
  citizen: {
    id: "test_fuqaro_1",
    fio: "Test",
    pinfl: "00000000000001",
    manzil: "Test",
    telefon: "+998 00 000-00-01",
    simulated: true,
  },
});

describe("MockAgencyAdapter deadlines", () => {
  const saved = { demo: process.env.DEMO_SPEED, days: process.env.SIM_RESPONSE_DAYS };
  beforeAll(() => {
    delete process.env.DEMO_SPEED; // MANUAL clock
    delete process.env.SIM_RESPONSE_DAYS; // default 15
  });
  afterAll(() => {
    if (saved.demo !== undefined) process.env.DEMO_SPEED = saved.demo;
    if (saved.days !== undefined) process.env.SIM_RESPONSE_DAYS = saved.days;
  });

  it("uses the agency's catalog javob_muddati when present", async () => {
    const adapter = new MockAgencyAdapter(new RoutingWithDeadline());
    const s = await adapter.submit(pkg("mehnat_inspeksiyasi", "Davlat mehnat inspeksiyasi"), { idempotencyKey: "k-mi" });
    expect(s.responseDays).toBe(10);
    expect((await adapter.advance(s.id, 9)).status).toBe("SUBMITTED");
    expect((await adapter.advance(s.id, 1)).status).toBe("OVERDUE");
  });

  it("is idempotent: the same key returns the same submission and receipt", async () => {
    const adapter = new MockAgencyAdapter(new RoutingWithDeadline());
    const a = await adapter.submit(pkg("prokuratura", "Prokuratura"), { idempotencyKey: "same" });
    const b = await adapter.submit(pkg("prokuratura", "Prokuratura"), { idempotencyKey: "same" });
    expect(b.id).toBe(a.id);
    expect(b.receiptId).toBe(a.receiptId);
    expect(a.adapterType).toBe("MOCK");
    expect(a.receiptId).toMatch(/^SIM-/);
    expect(await adapter.listInbox("prokuratura")).toHaveLength(1);
  });

  it("falls back to SIM_RESPONSE_DAYS (15) when the catalog has no deadline", async () => {
    const adapter = new MockAgencyAdapter(new RoutingWithDeadline());
    const s = await adapter.submit(pkg("prokuratura", "Prokuratura"), { idempotencyKey: "k-pr" });
    expect(s.responseDays).toBe(15);
    expect((await adapter.advance(s.id, 10)).status).toBe("SUBMITTED");
    expect((await adapter.advance(s.id, 5)).status).toBe("OVERDUE");
  });
});

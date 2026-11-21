import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "./audit.service";

const APP = "8c1c7a8e-5f0b-4b8a-9a35-0b7b6f1e2c11";

describe("AuditService", () => {
  const saved = process.env.RUNTIME_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.RUNTIME_DIR;
    else process.env.RUNTIME_DIR = saved;
  });

  it("chains events and detects a changed event after a restart", async () => {
    process.env.RUNTIME_DIR = mkdtempSync(join(tmpdir(), "lex-audit-"));
    const audit = new AuditService();
    const a = audit.record({ type: "APPLICATION_CONSENTED", actor: { type: "citizen", id: "c1" }, applicationId: APP });
    const b = audit.record({ type: "APPLICATION_SIGNED", actor: { type: "citizen", id: "c1" }, applicationId: APP, data: { simulated: true } });
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(b.prevHash).toBe(a.hash);
    expect(audit.verify()).toEqual({ valid: true, brokenAt: null, count: 2 });
    await audit.persist();

    // A restarted process continues the chain.
    const reopened = new AuditService();
    const c = reopened.record({ type: "SUBMISSION_CREATED", actor: { type: "citizen", id: "c1" }, applicationId: APP });
    expect(c.seq).toBe(3);
    expect(c.prevHash).toBe(b.hash);
    await reopened.persist();

    // Tampering with a stored event breaks verification at that event.
    const file = join(process.env.RUNTIME_DIR, "audit-events.json");
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, { seq: number; actor: { id: string } }>;
    const second = Object.values(raw).find((e) => e.seq === 2);
    if (second) second.actor.id = "someone-else";
    writeFileSync(file, JSON.stringify(raw));
    expect(new AuditService().verify()).toEqual({ valid: false, brokenAt: 2, count: 3 });
  });
});

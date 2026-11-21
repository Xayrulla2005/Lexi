/**
 * Phase 4: application lifecycle (state machine), exactly-once submission (parallel requests,
 * Idempotency-Key), audit trail, and the mock connector shown as a simulator.
 */
import "reflect-metadata";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import type { AuditEvent } from "@lex/contracts";
import { AppModule } from "../../apps/api/src/app.module";
import { AuditService } from "../../apps/api/src/audit/audit.service";
import { relaxRateLimits } from "./test-env";

const H = "x-sim-session";
const K = "idempotency-key";
const A = "x-sim-agency-session";
const MANUAL = { malumot_1: "Hisobchi", malumot_2: "Namuna MChJ", malumot_3: "sentabr", summa: "5 000 000" };
const KEYS = ["SIM_MODE", "RUNTIME_DIR", "SIM_KEYS_DIR", "DATABASE_URL", "DEMO_SPEED"] as const;

describe("Application gateway (Phase 4)", () => {
  let app: INestApplication<App>;
  let runtimeDir: string;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    for (const k of KEYS) delete process.env[k];
    relaxRateLimits();
    runtimeDir = mkdtempSync(join(tmpdir(), "lex-runtime-"));
    Object.assign(process.env, { SIM_MODE: "true", RUNTIME_DIR: runtimeDir, SIM_KEYS_DIR: mkdtempSync(join(tmpdir(), "lex-keys-")) });
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

  /** A consented and signed P12 application. */
  async function signed(citizen = "test_fuqaro_1") {
    const { body: session } = await http().post("/sim/oneid/login").send({ citizenId: citizen }).expect(201);
    const token: string = session.token;
    const { body: c } = await http().post("/cases").set(H, token).send({ channel: "web" }).expect(201);
    await http().post(`/cases/${c.id}/messages`).set(H, token).send({ text: "3 oydan beri oylik berishmayapti" }).expect(201);
    await http().post(`/cases/${c.id}/analyze`).set(H, token).expect(200);
    const { body: draft } = await http().post(`/cases/${c.id}/application`).set(H, token).expect(201);
    expect(draft.state).toBe("DRAFT");
    await http().patch(`/applications/${draft.id}/fields`).set(H, token).send({ values: MANUAL }).expect(200);
    const { body: consented } = await http().post(`/applications/${draft.id}/consent`).set(H, token).send({ consent: true }).expect(201);
    expect(consented.state).toBe("CONSENTED");
    const { body: s } = await http().post(`/applications/${draft.id}/sign`).set(H, token).expect(201);
    expect(s.state).toBe("SIGNED");
    return { token, appId: draft.id as string };
  }
  const submit = (token: string, appId: string, key?: string) => {
    const r = http().post("/submissions").set(H, token);
    return (key ? r.set(K, key) : r).send({ applicationId: appId, consent: true });
  };
  const inboxCount = async (appId: string) => {
    const { body: officer } = await http().post("/sim/idora/login").send({ agencyId: "mehnat_inspeksiyasi" }).expect(201);
    const { body: inbox } = await http().get("/sim/idora/mehnat_inspeksiyasi/inbox").set(A, officer.token).expect(200);
    return (inbox as { applicationId: string }[]).filter((s) => s.applicationId === appId).length;
  };

  it("parallel submits without a key: exactly one 201, the rest 409, one submission at the agency", async () => {
    const { token, appId } = await signed();
    const results = await Promise.all(Array.from({ length: 6 }, () => submit(token, appId)));
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409, 409]);
    expect(await inboxCount(appId)).toBe(1);
    const { body: after } = await http().get(`/applications/${appId}`).set(H, token).expect(200);
    expect(after.state).toBe("SUBMITTED");
  });

  it("Idempotency-Key: same key replays the original, parallel or not; misuse is rejected", async () => {
    const { token, appId } = await signed();
    const parallel = await Promise.all(Array.from({ length: 4 }, () => submit(token, appId, "key-aaaaaaaa")));
    expect(parallel.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    const ids = new Set(parallel.map((r) => r.body.id as string));
    expect(ids.size).toBe(1);
    expect(parallel.filter((r) => r.headers["idempotent-replayed"] === "true")).toHaveLength(3);
    expect(await inboxCount(appId)).toBe(1);

    const again = await submit(token, appId, "key-aaaaaaaa").expect(201);
    expect(again.body.id).toBe([...ids][0]);
    await submit(token, appId, "key-bbbbbbbb").expect(409); // new key, already submitted
    await submit(token, appId).expect(409);
    await submit(token, appId, "bad key!").expect(400);

    const other = await signed("test_fuqaro_2");
    await submit(other.token, other.appId, "key-aaaaaaaa").expect(201); // keys are per citizen
    const mine = await signed();
    await submit(mine.token, mine.appId, "key-cccccccc").expect(201);
    const { body: second } = await http().post("/sim/oneid/login").send({ citizenId: "test_fuqaro_1" }).expect(201);
    // Same citizen, same key, another application -> 422.
    const third = await signed();
    await submit(second.token, third.appId, "key-cccccccc").expect(422);
  });

  it("invalid transitions are rejected", async () => {
    const { token, appId } = await signed();
    await http().patch(`/applications/${appId}/fields`).set(H, token).send({ values: { summa: "1" } }).expect(409);
    await http().post(`/applications/${appId}/consent`).set(H, token).send({ consent: true }).expect(409);
    await http().post(`/applications/${appId}/sign`).set(H, token).expect(409);
    await submit(token, appId).expect(201);
    await http().post(`/applications/${appId}/sign`).set(H, token).expect(409);
    await http().patch(`/applications/${appId}/fields`).set(H, token).send({ values: { summa: "1" } }).expect(409);
  });

  it("audit trail: consent, signature, submission, receipt, statuses — hash-chained, no content", async () => {
    const { token, appId } = await signed();
    const { body: sub } = await submit(token, appId, "key-audit-1").expect(201);
    expect(sub.adapterType).toBe("MOCK");
    expect(sub.receiptId).toMatch(/^SIM-MI-/);
    await submit(token, appId, "key-audit-1").expect(201); // replay
    const { body: officer } = await http().post("/sim/idora/login").send({ agencyId: "mehnat_inspeksiyasi" }).expect(201);
    await http().post(`/sim/idora/submissions/${sub.id}/status`).set(A, officer.token).send({ status: "RECEIVED" }).expect(201);
    await http().post(`/sim/idora/submissions/${sub.id}/respond`).set(A, officer.token).send({ text: "Javob matni" }).expect(201);

    const { body: events } = (await http().get(`/applications/${appId}/audit`).set(H, token).expect(200)) as { body: AuditEvent[] };
    expect(events.map((e) => e.type)).toEqual([
      "APPLICATION_CONSENTED",
      "APPLICATION_SIGNED",
      "SUBMISSION_CREATED",
      "RECEIPT_ISSUED",
      "SUBMISSION_REPLAYED",
      "SUBMISSION_STATUS_CHANGED",
      "SUBMISSION_STATUS_CHANGED",
    ]);
    const receipt = events.find((e) => e.type === "RECEIPT_ISSUED");
    expect(receipt?.data).toMatchObject({ receiptId: sub.receiptId, adapterType: "MOCK", simulated: true });
    expect(events.filter((e) => e.type === "SUBMISSION_STATUS_CHANGED").map((e) => [e.data.from, e.data.to, e.actor.type])).toEqual([
      ["SUBMITTED", "RECEIVED", "agency"],
      ["RECEIVED", "ANSWERED", "agency"],
    ]);
    expect(events[0]?.actor).toEqual({ type: "citizen", id: "test_fuqaro_1" });
    const signedEvent = events.find((e) => e.type === "APPLICATION_SIGNED");
    expect(signedEvent?.data.pdfSha256).toMatch(/^[0-9a-f]{64}$/);

    // No document content, field values, answers, signatures, tokens or idempotency keys.
    const json = JSON.stringify(events);
    for (const secret of ["5 000 000", "Namuna MChJ", "Hisobchi", "Javob matni", "key-audit-1", token, "%PDF"]) {
      expect(json).not.toContain(secret);
    }
    // Persisted with the same guarantees; the chain verifies.
    const file = readFileSync(join(runtimeDir, "audit-events.json"), "utf8");
    expect(file).not.toContain("5 000 000");
    expect(app.get(AuditService).verify().valid).toBe(true);

    // Another citizen cannot read it.
    const { body: other } = await http().post("/sim/oneid/login").send({ citizenId: "test_fuqaro_2" }).expect(201);
    await http().get(`/applications/${appId}/audit`).set(H, other.token).expect(403);
  });

  it("editing after consent resets it and is audited", async () => {
    const { body: session } = await http().post("/sim/oneid/login").send({ citizenId: "test_fuqaro_3" }).expect(201);
    const token: string = session.token;
    const { body: c } = await http().post("/cases").set(H, token).send({ channel: "web" }).expect(201);
    await http().post(`/cases/${c.id}/messages`).set(H, token).send({ text: "oylik bermayapti" }).expect(201);
    await http().post(`/cases/${c.id}/analyze`).set(H, token).expect(200);
    const { body: draft } = await http().post(`/cases/${c.id}/application`).set(H, token).expect(201);
    await http().patch(`/applications/${draft.id}/fields`).set(H, token).send({ values: MANUAL }).expect(200);
    await http().post(`/applications/${draft.id}/consent`).set(H, token).send({ consent: true }).expect(201);
    const { body: edited } = await http().patch(`/applications/${draft.id}/fields`).set(H, token).send({ values: { summa: "6 000 000" } }).expect(200);
    expect(edited.state).toBe("DRAFT");
    expect(edited.consentAt).toBeNull();
    await http().post(`/applications/${draft.id}/sign`).set(H, token).expect(400);
    const { body: events } = await http().get(`/applications/${draft.id}/audit`).set(H, token).expect(200);
    expect((events as AuditEvent[]).map((e) => e.type)).toEqual(["APPLICATION_CONSENTED", "APPLICATION_CONSENT_RESET"]);
  });
});

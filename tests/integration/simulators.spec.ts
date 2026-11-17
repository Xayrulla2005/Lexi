/**
 * End-to-end simulator flow (Jest + Supertest), no network or keys required:
 * OneID login -> P12 analysis -> application -> consent -> ERI signature -> submit
 * -> agency cabinet inbox -> answer -> citizen sees ANSWERED; and
 * no answer -> OVERDUE -> escalation draft (not submitted).
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

const H = "x-sim-session";
const MANUAL = { malumot_1: "Hisobchi", malumot_2: "Namuna MChJ", malumot_3: "sentabr", summa: "5 000 000" };
const ENV_KEYS = ["DEMO_SPEED", "SIM_RESPONSE_DAYS", "SIM_KEYS_DIR", "DATABASE_URL"] as const;

async function startApp(env: Partial<Record<(typeof ENV_KEYS)[number], string>>): Promise<INestApplication<App>> {
  delete process.env.DATABASE_URL;
  process.env.SIM_KEYS_DIR = mkdtempSync(join(tmpdir(), "lex-keys-"));
  Object.assign(process.env, env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}

/** Runs the citizen side up to a signed application; returns its id and the session token. */
async function signedApplication(app: INestApplication<App>) {
  const http = () => request(app.getHttpServer());
  const { body: session } = await http().post("/sim/oneid/login").send({ citizenId: "test_fuqaro_1" }).expect(201);
  const token: string = session.token;
  const { body: c } = await http().post("/cases").send({ channel: "web" }).expect(201);
  await http().post(`/cases/${c.id}/messages`).send({ text: "3 oydan beri oylik berishmayapti" }).expect(201);
  const { body: analyzed } = await http().post(`/cases/${c.id}/analyze`).expect(200);
  expect(analyzed.routingDecision.routeId).toBe("P12");

  const { body: draft } = await http().post(`/cases/${c.id}/application`).set(H, token).expect(201);
  expect(draft.templateId).toBe("T12");
  await http().patch(`/applications/${draft.id}/fields`).set(H, token).send({ values: MANUAL }).expect(200);
  const { body: consented } = await http().post(`/applications/${draft.id}/consent`).set(H, token).send({ consent: true }).expect(201);
  expect(consented.consentAt).not.toBeNull();
  const { body: signed } = await http().post(`/applications/${draft.id}/sign`).set(H, token).expect(201);
  expect(signed.signature.algorithm).toBe("Ed25519");
  return { appId: draft.id as string, token, caseId: c.id as string };
}

describe("Simulator flow (integration)", () => {
  let app: INestApplication<App>;
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

  beforeAll(async () => {
    app = await startApp({ DEMO_SPEED: "86400000", SIM_RESPONSE_DAYS: "15" });
  });
  afterAll(async () => {
    await app.close();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("requires a OneID simulator session for applications", async () => {
    const { body: c } = await request(app.getHttpServer()).post("/cases").send({ channel: "web" }).expect(201);
    await request(app.getHttpServer()).post(`/cases/${c.id}/application`).expect(401);
  });

  it("rejects submission without consent in the body, and unsigned applications", async () => {
    const http = () => request(app.getHttpServer());
    const { body: session } = await http().post("/sim/oneid/login").send({ citizenId: "test_fuqaro_2" }).expect(201);
    const { body: c } = await http().post("/cases").send({ channel: "web" }).expect(201);
    await http().post(`/cases/${c.id}/messages`).send({ text: "oylik bermayapti" }).expect(201);
    await http().post(`/cases/${c.id}/analyze`).expect(200);
    const { body: draft } = await http().post(`/cases/${c.id}/application`).set(H, session.token).expect(201);

    await http().post("/submissions").set(H, session.token).send({ applicationId: draft.id }).expect(400);
    await http().post("/submissions").set(H, session.token).send({ applicationId: draft.id, consent: false }).expect(400);
    await http().post("/submissions").set(H, session.token).send({ applicationId: draft.id, consent: true }).expect(400);
    await http().post(`/applications/${draft.id}/sign`).set(H, session.token).expect(400); // no consent yet
  });

  it("full chain: submit -> cabinet -> answer -> citizen sees ANSWERED", async () => {
    const http = () => request(app.getHttpServer());
    const { appId, token } = await signedApplication(app);

    const { body: sub } = await http().post("/submissions").set(H, token).send({ applicationId: appId, consent: true }).expect(201);
    expect(sub.status).toBe("SUBMITTED");
    expect(sub.agencyId).toBe("mehnat_inspeksiyasi");
    expect(sub.receiptId).toMatch(/^SIM-MI-/);

    const { body: inbox } = await http().get("/sim/idora/mehnat_inspeksiyasi/inbox").expect(200);
    expect(inbox.map((s: { id: string }) => s.id)).toContain(sub.id);

    const { body: item } = await http().get(`/sim/idora/submissions/${sub.id}`).expect(200);
    expect(item.signatureCheck).toEqual({ valid: true, message: "Imzo haqiqiy" });
    expect(item.caseInfo.problemId).toBe("P12");
    expect(item.caseInfo.fields.summa).toBe("5 000 000");
    expect(item.citizen.pinfl).toBe("00000000000001");
    const pdf = await http().get(`/sim/idora/submissions/${sub.id}/pdf`).expect(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");

    await http().post(`/sim/idora/submissions/${sub.id}/status`).send({ status: "RECEIVED" }).expect(201);
    await http().post(`/sim/idora/submissions/${sub.id}/status`).send({ status: "IN_REVIEW" }).expect(201);
    await http().post(`/sim/idora/submissions/${sub.id}/respond`).send({ text: "Murojaatingiz ko'rib chiqildi." }).expect(201);

    const { body: tracked } = await http().get(`/submissions/${sub.id}`).set(H, token).expect(200);
    expect(tracked.status).toBe("ANSWERED");
    expect(tracked.response.text).toBe("Murojaatingiz ko'rib chiqildi.");
    expect(tracked.history.map((h: { status: string }) => h.status)).toEqual(["SUBMITTED", "RECEIVED", "IN_REVIEW", "ANSWERED"]);

    // Someone else's session cannot read it; a signed application cannot be submitted twice.
    const { body: other } = await http().post("/sim/oneid/login").send({ citizenId: "test_fuqaro_3" }).expect(201);
    await http().get(`/submissions/${sub.id}`).set(H, other.token).expect(403);
    await http().post("/submissions").set(H, token).send({ applicationId: appId, consent: true }).expect(409);
  });
});

describe("Simulator overdue -> escalation draft (integration)", () => {
  let app: INestApplication<App>;
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

  beforeAll(async () => {
    // 1 simulated day = 50 ms, deadline 2 days -> OVERDUE after ~100 ms.
    app = await startApp({ DEMO_SPEED: "50", SIM_RESPONSE_DAYS: "2" });
  });
  afterAll(async () => {
    await app.close();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("no answer -> OVERDUE -> draft for the first escalation agency, not submitted", async () => {
    const http = () => request(app.getHttpServer());
    const { appId, token } = await signedApplication(app);
    const { body: sub } = await http().post("/submissions").set(H, token).send({ applicationId: appId, consent: true }).expect(201);

    await new Promise((r) => setTimeout(r, 400));
    const { body: tracked } = await http().get(`/submissions/${sub.id}`).set(H, token).expect(200);
    expect(tracked.status).toBe("OVERDUE");
    expect(tracked.escalationApplicationId).not.toBeNull();

    const { body: draft } = await http().get(`/applications/${tracked.escalationApplicationId}`).set(H, token).expect(200);
    expect(draft.kind).toBe("ESCALATION");
    expect(draft.agency.id).toBe("bandlik_vazirligi");
    expect(draft.consentAt).toBeNull();
    expect(draft.signature).toBeNull();
    expect(draft.submissionId).toBeNull();
    expect(draft.missingFields).toEqual([]); // manual answers reused

    // The user consents and signs again; submitting it escalates the original.
    await http().post(`/applications/${draft.id}/consent`).set(H, token).send({ consent: true }).expect(201);
    await http().post(`/applications/${draft.id}/sign`).set(H, token).expect(201);
    await http().post("/submissions").set(H, token).send({ applicationId: draft.id, consent: true }).expect(201);
    const { body: original } = await http().get(`/submissions/${sub.id}`).set(H, token).expect(200);
    expect(original.status).toBe("ESCALATED");
  });
});

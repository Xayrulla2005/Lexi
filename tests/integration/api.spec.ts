/**
 * HTTP integration tests for apps/api (Jest + Supertest).
 * Executed by apps/api's Jest config — run with `pnpm test` from the repo root.
 * No database, network or AI keys required.
 */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { AppModule } from "../../apps/api/src/app.module";

interface Scenario {
  id: string;
  input: string;
  expected: { riskLevel: string; problemId: string | null; routeType: string; agencyId: string | null };
}

const { scenarios } = JSON.parse(
  readFileSync(join(__dirname, "../scenarios/demo-scenarios.json"), "utf8"),
) as { scenarios: Scenario[] };

describe("API (integration)", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    delete process.env.DATABASE_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function analyzedCase(text: string) {
    const created = await request(app.getHttpServer()).post("/cases").send({ channel: "web" }).expect(201);
    await request(app.getHttpServer()).post(`/cases/${created.body.id}/messages`).send({ text }).expect(201);
    const res = await request(app.getHttpServer()).post(`/cases/${created.body.id}/analyze`).expect(200);
    return res.body;
  }

  it("GET /health", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(res.body.status).toBe("ok");
  });

  it.each(scenarios.map((s) => [s.id, s] as const))("scenario %s", async (_id, s) => {
    const c = await analyzedCase(s.input);
    expect(c.analysis.risk.level).toBe(s.expected.riskLevel);
    expect(c.analysis.classification.problemId).toBe(s.expected.problemId);
    expect(c.routingDecision.routeType).toBe(s.expected.routeType);
    expect(c.routingDecision.agencyId).toBe(s.expected.agencyId);
    expect(c.routingDecision.requiresHumanReview).toBe(true); // no catalog route is VERIFIED yet
  });

  it("rejects submission without explicit consent", async () => {
    const c = await analyzedCase(scenarios[0]!.input);
    await request(app.getHttpServer())
      .post("/submissions")
      .send({ caseId: c.id, agencyId: "mehnat_inspeksiyasi" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/submissions")
      .send({ caseId: c.id, agencyId: "mehnat_inspeksiyasi", consent: false })
      .expect(400);
  });

  it("rejects submission to an agency outside the routing decision", async () => {
    const c = await analyzedCase(scenarios[0]!.input);
    await request(app.getHttpServer())
      .post("/submissions")
      .send({ caseId: c.id, agencyId: "mib", consent: true })
      .expect(400);
  });

  it("submits to the mock gateway with consent and tracks status", async () => {
    const c = await analyzedCase(scenarios[0]!.input);
    const sub = await request(app.getHttpServer())
      .post("/submissions")
      .send({ caseId: c.id, agencyId: "mehnat_inspeksiyasi", consent: true })
      .expect(201);
    expect(sub.body.adapterType).toBe("MOCK");
    expect(sub.body.receiptId).toMatch(/^SIM-/);

    const tracked = await request(app.getHttpServer()).get(`/submissions/${sub.body.id}`).expect(200);
    expect(tracked.body.status).toBe("RECEIVED");

    const caseRes = await request(app.getHttpServer()).get(`/cases/${c.id}`).expect(200);
    expect(caseRes.body.status).toBe("SUBMITTED");

    const sim = await request(app.getHttpServer()).get("/simulator/mehnat_inspeksiyasi/submissions").expect(200);
    expect(sim.body.map((s: { id: string }) => s.id)).toContain(sub.body.id);
  });
});

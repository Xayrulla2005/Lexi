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
import { relaxRateLimits, restoreRateLimits } from "./test-env";

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
    relaxRateLimits();
    process.env.SIM_MODE = "true"; // cases need an authenticated citizen (OneID simulator)
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    restoreRateLimits();
  });

  async function analyzedCase(text: string) {
    const http = () => request(app.getHttpServer());
    const { body: session } = await http().post("/sim/oneid/login").send({ citizenId: "test_fuqaro_1" }).expect(201);
    const H = { "x-sim-session": session.token as string };
    const created = await http().post("/cases").set(H).send({ channel: "web" }).expect(201);
    await http().post(`/cases/${created.body.id}/messages`).set(H).send({ text }).expect(201);
    const res = await http().post(`/cases/${created.body.id}/analyze`).set(H).expect(200);
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
});

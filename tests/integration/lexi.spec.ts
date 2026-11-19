/**
 * Lexi demo scenarios end-to-end (Jest + Supertest) with a mocked LLM and catalog-only
 * retrieval: no network, no API keys, no embedding model.
 */
import "reflect-metadata";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { getArticlesForProblem, type ChatMessage, type ChatModelProvider, type ProviderChoice } from "@lex/ai";
import type { Conversation } from "@lex/contracts";
import { AppModule } from "../../apps/api/src/app.module";
import { ARTICLE_RETRIEVER, LLM_CHAT } from "../../apps/api/src/llm/llm.module";

interface Scenario {
  id: string;
  story: string;
  triageAnswer?: string;
  answers: string[];
  simCall?: string;
  expect: { triageQuestion: boolean; emergency: boolean; problemId: string | null; roadmap: "llm" | "catalog"; offer: boolean; submitAndAnswer?: boolean };
}
const { scenarios } = JSON.parse(readFileSync(join(__dirname, "../scenarios/lexi-scenarios.json"), "utf8")) as { scenarios: Scenario[] };
const H = "x-sim-session";

/** Deterministic stand-in for Gemini: answers by prompt type, never looks at test expectations. */
const mockLlm: ChatModelProvider = {
  id: "mock:lexi",
  async complete(messages: readonly ChatMessage[]): Promise<string> {
    const system = messages[0]?.content ?? "";
    const user = messages.at(-1)?.content ?? "";
    if (system.startsWith("You classify")) {
      if (/oylik/i.test(user)) return JSON.stringify({ reason: "Ish haqi to'lanmagan.", domain: "mehnat", problemId: "P12", risk: "yellow", confidence: 0.95, alternativeProblemId: "P49" });
      if (/erim/i.test(user)) return JSON.stringify({ reason: "Oilaviy zo'ravonlik.", domain: "zoravonlik", problemId: "P25", risk: "red", confidence: 0.95, alternativeProblemId: "P29" });
      return JSON.stringify({ reason: "Yo'l-transport hodisasi.", domain: "yol_harakati", problemId: "NONE", risk: "orange", confidence: 0.3, alternativeProblemId: "NONE" });
    }
    if (system.includes("fill in a complaint/application form")) {
      const keys = [...user.matchAll(/^- ([a-z0-9_]+):/gm)].map((m) => m[1] as string);
      return JSON.stringify({ understood: "Holatingiz yozib olindi.", fields: [], questions: keys.slice(0, 2).map((k) => ({ key: k, question: `${k} haqida yozing?` })) });
    }
    if (system.includes("describe their situation")) {
      return JSON.stringify({ understood: "Avariyaga tushgansiz.", questions: ["Avariya qachon va qayerda bo'ldi?", "Kim aybdor deb hisoblaysiz?"] });
    }
    if (system.includes("explain a citizen's legal situation")) {
      const keys = [...user.matchAll(/^### ([a-z_]+\/[0-9-]+) —/gm)].map((m) => m[1] as string);
      const k = keys[0];
      const claims = k ? [{ text: "Bu moddaga ko'ra huquqingiz bor.", citations: [k] }] : [];
      return JSON.stringify({
        summary: claims,
        rights: claims,
        obligations: k ? [{ text: "Hujjatlarni saqlab qo'ying.", citations: [k] }] : [],
        deadlines: [],
        agencies: system.includes("AGENCIES") ? ["yhxx", "sugurta", "invented_agency"] : [],
      });
    }
    throw new Error("unexpected prompt");
  },
};
const mockChat: ProviderChoice = { name: "gemini", provider: mockLlm, unavailable: null };

describe("Lexi scenarios (integration, mocked LLM)", () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DEMO_SPEED;
    process.env.SIM_KEYS_DIR = mkdtempSync(join(tmpdir(), "lex-keys-"));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LLM_CHAT)
      .useValue(mockChat)
      .overrideProvider(ARTICLE_RETRIEVER)
      .useValue(async (_story: string, problemId: string | null) => (problemId ? getArticlesForProblem(problemId) : []))
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  const say = async (id: string, text: string, token?: string): Promise<Conversation> => {
    const r = http().post(`/conversations/${id}/messages`).send({ text });
    return (await (token ? r.set(H, token) : r).expect(200)).body as Conversation;
  };
  const act = async (id: string, action: string, token?: string, status = 200): Promise<Conversation> => {
    const r = http().post(`/conversations/${id}/actions`).send({ action });
    return (await (token ? r.set(H, token) : r).expect(status)).body as Conversation;
  };
  const cards = (c: Conversation) => c.messages.map((m) => m.card?.type).filter(Boolean);

  it.each(scenarios.map((s) => [s.id, s] as const))("%s", async (_id, s) => {
    let c = (await http().post("/conversations").send({ channel: "web" }).expect(201)).body as Conversation;
    c = await say(c.id, s.story);

    // a) TRIAGE
    const askedTriage = c.messages.some((m) => m.role === "lexi" && m.text.startsWith("Siz yoki boshqa birov jarohat oldimi"));
    expect(askedTriage).toBe(s.expect.triageQuestion);
    if (s.triageAnswer) c = await say(c.id, s.triageAnswer);
    expect(cards(c).includes("emergency")).toBe(s.expect.emergency);
    if (s.expect.emergency) {
      const em = c.messages.find((m) => m.card?.type === "emergency");
      expect(em?.actions.filter((a) => a.kind === "tel").map((a) => a.value)).toEqual(["102", "1146", "103"]);
    }

    // b) DETAILS: one question at a time, "Sizni shunday tushundim" after each answer
    expect(c.messages.some((m) => m.text.startsWith("Sizni shunday tushundim:"))).toBe(true);
    for (const answer of s.answers) {
      if (!c.pending || (c.pending.kind !== "field" && c.pending.kind !== "fact")) break;
      c = await say(c.id, answer);
      expect(c.messages.at(-1)?.role).toBe("lexi");
    }
    expect(c.problemId).toBe(s.expect.problemId);

    // c) EXPLAIN + d) ROADMAP
    const roadmap = c.messages.find((m) => m.card?.type === "roadmap")?.card;
    expect(roadmap?.type === "roadmap" && roadmap.source).toBe(s.expect.roadmap);
    if (roadmap?.type === "roadmap" && roadmap.source === "llm") {
      expect(roadmap.steps.map((st) => st.agency?.id)).toEqual(["yhxx", "sugurta"]); // invented id dropped
    }
    if (s.expect.roadmap === "catalog") {
      const ex = c.messages.find((m) => m.card?.type === "explanation")?.card;
      expect(ex?.type === "explanation" && ex.articles.length).toBeGreaterThan(0);
    }

    // e) ACTION offer
    const offer = c.pending?.kind === "offer";
    expect(offer).toBe(s.expect.offer);

    if (s.simCall) {
      await act(c.id, `call_confirm:${s.simCall}`, undefined, 400); // no confirmation asked yet
      c = await act(c.id, `call:${s.simCall}`);
      c = await act(c.id, `call_confirm:${s.simCall}`);
      expect(cards(c)).toContain("emergency_call");
      const { body: calls } = await http().get(`/sim/idora/${s.simCall}/calls`).expect(200);
      expect(calls.map((x: { conversationId: string; status: string }) => [x.conversationId, x.status])).toContainEqual([c.id, "CREW_DISPATCHED"]);
    }

    if (s.expect.submitAndAnswer) {
      // Not logged in -> login card; nothing is created.
      c = await act(c.id, "offer_yes");
      expect(c.messages.at(-1)?.card?.type).toBe("login");
      expect(c.applicationId).toBeNull();
      const { body: session } = await http().post("/sim/oneid/login").send({ citizenId: "test_fuqaro_1" }).expect(201);
      const token: string = session.token;
      c = await act(c.id, "offer_yes", token);
      const appId = c.applicationId as string;
      expect(c.messages.at(-1)?.card).toEqual({ type: "application", applicationId: appId });

      // The user's answers are in the application; the rest is filled in the form; then consent, ERI, send.
      const { body: draft } = await http().get(`/applications/${appId}`).set(H, token).expect(200);
      const missing: string[] = draft.missingFields;
      const values = Object.fromEntries(missing.map((k) => [k, "test"]));
      if (missing.length) await http().patch(`/applications/${appId}/fields`).set(H, token).send({ values }).expect(200);
      await http().post(`/applications/${appId}/consent`).set(H, token).send({ consent: true }).expect(201);
      await http().post(`/applications/${appId}/sign`).set(H, token).expect(201);
      const { body: sub } = await http().post("/submissions").set(H, token).send({ applicationId: appId, consent: true }).expect(201);

      // f) TRACKING: status messages appear in the conversation.
      c = (await http().get(`/conversations/${c.id}`).set(H, token).expect(200)).body as Conversation;
      const submitted = c.messages.at(-1);
      expect(submitted?.card?.type).toBe("status");
      expect(submitted?.actions[0]?.value).toBe(`/idora?submission=${sub.id}`);

      await http().post(`/sim/idora/submissions/${sub.id}/status`).send({ status: "RECEIVED" }).expect(201);
      c = (await http().get(`/conversations/${c.id}`).set(H, token).expect(200)).body as Conversation;
      expect(c.messages.at(-1)?.text).toBe("Davlat mehnat inspeksiyasi arizangizni qabul qildi.");
      await http().post(`/sim/idora/submissions/${sub.id}/respond`).send({ text: "Tekshiruv tayinlandi." }).expect(201);
      c = (await http().get(`/conversations/${c.id}`).set(H, token).expect(200)).body as Conversation;
      expect(c.messages.at(-1)?.text).toBe("Davlat mehnat inspeksiyasidan javob keldi: «Tekshiruv tayinlandi.»");
    }
  });

  it("a red keyword shows the emergency card at once, before any question", async () => {
    let c = (await http().post("/conversations").send({ channel: "web" }).expect(201)).body as Conversation;
    c = await say(c.id, "erim pichoq bilan o'ldiraman deyapti");
    const first = c.messages.findIndex((m) => m.card?.type === "emergency");
    expect(first).toBe(2); // greeting, user story, emergency card
  });

  it("an unclear safety answer counts as danger", async () => {
    let c = (await http().post("/conversations").send({ channel: "web" }).expect(201)).body as Conversation;
    c = await say(c.id, "Avariya bo'ldim");
    c = await say(c.id, "bilmadim, oyog'im og'riyapti");
    expect(cards(c)).toContain("emergency");
  });
});

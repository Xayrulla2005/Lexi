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
import type { Conversation, StartedConversation } from "@lex/contracts";
import { AppModule } from "../../apps/api/src/app.module";
import { relaxRateLimits, restoreRateLimits } from "./test-env";
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
const T = "x-conversation-token";
const A = "x-sim-agency-session";

/** Deterministic stand-in for Gemini: answers by prompt type, never looks at test expectations. */
const mockLlm: ChatModelProvider = {
  id: "mock:lexi",
  async complete(messages: readonly ChatMessage[]): Promise<string> {
    const system = messages[0]?.content ?? "";
    const user = messages.at(-1)?.content ?? "";
    if (system.startsWith("You sort a citizen's message")) {
      if (/ishga kir|firma|meros/i.test(user)) return JSON.stringify({ intent: "procedure", confidence: 0.9 });
      if (/beriladimi|mumkinmi/i.test(user)) return JSON.stringify({ intent: "question", confidence: 0.9 });
      if (/ob-havo/i.test(user)) return JSON.stringify({ intent: "not_legal", confidence: 0.9 });
      if (/yordam kerak/i.test(user)) return JSON.stringify({ intent: "dispute", confidence: 0.3 }); // unclear
      return JSON.stringify({ intent: "dispute", confidence: 0.9 });
    }
    if (system.startsWith("A citizen in Uzbekistan asks how to do a procedure")) {
      return JSON.stringify({ questions: [{ label: "Lavozim", question: "Qaysi lavozimga?" }] });
    }
    if (system.startsWith("You give a citizen in Uzbekistan a short step-by-step roadmap")) {
      const k = [...user.matchAll(/^### ([a-z_]+\/[0-9-]+) —/gm)].map((m) => m[1] as string)[0];
      return JSON.stringify({
        steps: [
          { title: "Kadrlar bo'limiga ariza topshiring.", agencyId: "iiv", citations: k ? [k] : [], documents: [], deadline: null },
          { title: "Tibbiy ko'rikdan o'ting.", agencyId: "invented_agency", citations: ["invented/1"], documents: ["tibbiy ma'lumotnoma"], deadline: "10 kun" },
        ],
      });
    }
    if (system.startsWith("You answer a citizen's legal question")) {
      const k = [...user.matchAll(/^### ([a-z_]+\/[0-9-]+) —/gm)].map((m) => m[1] as string)[0];
      return JSON.stringify({ answer: k ? [{ text: "Bu moddaga ko'ra kompensatsiya to'lanadi.", citations: [k] }, { text: "To'qima gap.", citations: ["invented/9"] }] : [] });
    }
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
        // "mashinam" stories: the model picks no agency (tests the catalog fallback after a triage signal).
        agencies: system.includes("AGENCIES") && !/mashinam/i.test(user) ? ["yhxx", "sugurta", "invented_agency"] : [],
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
    relaxRateLimits();
    delete process.env.DEMO_SPEED;
    process.env.SIM_MODE = "true";
    process.env.SIM_KEYS_DIR = mkdtempSync(join(tmpdir(), "lex-keys-"));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LLM_CHAT)
      .useValue(mockChat)
      .overrideProvider(ARTICLE_RETRIEVER)
      .useValue(async (story: string, problemId: string | null) =>
        problemId ? getArticlesForProblem(problemId) : /ishga kir|bo'shat/i.test(story) ? getArticlesForProblem("P12") : [],
      )
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    restoreRateLimits();
  });

  /** Conversation access tokens by conversation id (what the web keeps in storage). */
  const tokens = new Map<string, string>();
  const startConversation = async (): Promise<Conversation> => {
    const started = (await http().post("/conversations").send({ channel: "web" }).expect(201)).body as StartedConversation;
    tokens.set(started.conversation.id, started.access.token);
    return started.conversation;
  };
  const say = async (id: string, text: string, token?: string): Promise<Conversation> => {
    const r = http().post(`/conversations/${id}/messages`).set(T, tokens.get(id) ?? "").send({ text });
    return (await (token ? r.set(H, token) : r).expect(200)).body as Conversation;
  };
  const act = async (id: string, action: string, token?: string, status = 200): Promise<Conversation> => {
    const r = http().post(`/conversations/${id}/actions`).set(T, tokens.get(id) ?? "").send({ action });
    return (await (token ? r.set(H, token) : r).expect(status)).body as Conversation;
  };
  const officer = async (agencyId: string): Promise<string> =>
    (await http().post("/sim/idora/login").send({ agencyId }).expect(201)).body.token as string;
  const cards = (c: Conversation) => c.messages.map((m) => m.card?.type).filter(Boolean);

  it.each(scenarios.map((s) => [s.id, s] as const))("%s", async (_id, s) => {
    let c = await startConversation();
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
    const understoodLen = c.messages.find((m) => m.text.startsWith("Sizni shunday tushundim:"))?.text.length ?? 0;
    for (const answer of s.answers) {
      if (!c.pending || (c.pending.kind !== "field" && c.pending.kind !== "fact")) break;
      const before = c.messages.length;
      c = await say(c.id, answer);
      expect(c.messages.at(-1)?.role).toBe("lexi");
      // One short "✓ label: value" confirmation per answer; the restatement is not repeated.
      const confirm = c.messages[before + 1];
      expect(confirm?.text).toMatch(/^✓ [^:]{1,32}: /);
      expect(confirm?.text.length).toBeLessThanOrEqual(answer.length + 40);
    }
    expect(c.messages.filter((m) => m.text.startsWith("Sizni shunday tushundim:"))).toHaveLength(1);
    expect(understoodLen).toBeGreaterThan(0);
    // "Sizdan olingan ma'lumotlar" comes once, before the explanation, with "ma'lum emas" for unknowns.
    const factsAt = c.messages.findIndex((m) => m.card?.type === "facts");
    if (s.answers.length && factsAt >= 0) {
      const facts = c.messages[factsAt]?.card;
      expect(facts?.type === "facts" && facts.items.length).toBeGreaterThan(0);
      const explainAt = c.messages.findIndex((m) => m.card?.type === "explanation");
      if (explainAt >= 0) expect(factsAt).toBeLessThan(explainAt);
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
      const { body: calls } = await http().get(`/sim/idora/${s.simCall}/calls`).set(A, await officer(s.simCall)).expect(200);
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
      expect(submitted?.actions[0]?.value).toBe(`/idora?agency=mehnat_inspeksiyasi&submission=${sub.id}`);

      const mi = await officer("mehnat_inspeksiyasi");
      await http().post(`/sim/idora/submissions/${sub.id}/status`).set(A, mi).send({ status: "RECEIVED" }).expect(201);
      c = (await http().get(`/conversations/${c.id}`).set(H, token).expect(200)).body as Conversation;
      expect(c.messages.at(-1)?.text).toBe("Davlat mehnat inspeksiyasi arizangizni qabul qildi.");
      await http().post(`/sim/idora/submissions/${sub.id}/respond`).set(A, mi).send({ text: "Tekshiruv tayinlandi." }).expect(201);
      c = (await http().get(`/conversations/${c.id}`).set(H, token).expect(200)).body as Conversation;
      expect(c.messages.at(-1)?.text).toBe("Davlat mehnat inspeksiyasidan javob keldi: «Tekshiruv tayinlandi.»");
    }
  });

  it("a red keyword shows the emergency card at once, before any question", async () => {
    let c = await startConversation();
    c = await say(c.id, "erim pichoq bilan o'ldiraman deyapti");
    const first = c.messages.findIndex((m) => m.card?.type === "emergency");
    expect(first).toBe(2); // greeting, user story, emergency card
  });

  it("after a triage signal the conversation never ends without catalog agencies", async () => {
    let c = await startConversation();
    c = await say(c.id, "Mashinam bilan avariya bo'ldim");
    c = await say(c.id, "Yo'q, xavfsizman");
    while (c.pending && (c.pending.kind === "fact" || c.pending.kind === "field")) c = await say(c.id, "Bilmayman");
    const roadmap = c.messages.find((m) => m.card?.type === "roadmap")?.card;
    expect(roadmap?.type === "roadmap" && roadmap.steps.map((s) => s.agency?.id)).toEqual(["yhxx", "sugurta"]);
    expect(c.messages.filter((m) => m.text === "Yo'l xaritasi:" && !m.card)).toHaveLength(0);
  });

  describe("intents", () => {
    const start = async (text: string) => {
      const c = await startConversation();
      return say(c.id, text);
    };
    const hasEmergencyNumber = (c: Conversation) =>
      c.messages.some(
        (m) =>
          m.card?.type === "emergency" ||
          m.actions.some((a) => a.kind === "tel") ||
          (m.card?.type === "roadmap" && m.card.steps.some((s) => /\b(102|103|1146)\b/.test(s.agency?.phone ?? ""))),
      );

    it("procedure: 'iiv ga ishga kirish' -> clarify, cited + general steps, no 102, no application, violation -> dispute", async () => {
      let c = await start("iiv ga ishga kirishim uchun yordam ber");
      expect(c.intent).toBe("procedure");
      expect(c.pending?.kind).toBe("clarify");
      expect(c.messages.at(-1)?.text).toBe("Qaysi lavozimga?");
      c = await say(c.id, "Patrul xizmati");
      expect(c.messages.some((m) => m.text === "✓ Lavozim: Patrul xizmati")).toBe(true);

      const roadmap = c.messages.find((m) => m.card?.type === "roadmap")?.card;
      if (roadmap?.type !== "roadmap") throw new Error("no roadmap");
      expect(roadmap.source).toBe("procedure");
      const [first, second, official] = roadmap.steps;
      expect(first?.agency?.id).toBe("iiv");
      expect(first?.agency?.phone).toBeNull(); // no 102 without a danger signal
      expect(first?.general).toBe(false);
      expect(first?.citations?.length).toBeGreaterThan(0);
      expect(roadmap.articles?.map((a) => a.key)).toEqual(first?.citations);
      // Uncited step: general direction, invented agency/citation dropped, no documents or deadline.
      expect(second).toMatchObject({ general: true, agency: null, citations: [], documents: [], deadline: null });
      expect(official?.agency?.id).toBe("davlat_xizmatlari");
      expect(hasEmergencyNumber(c)).toBe(false);
      expect(c.messages.some((m) => m.card?.type === "facts" || m.card?.type === "application")).toBe(false);
      expect(c.messages.some((m) => m.actions.some((a) => a.value === "offer_yes"))).toBe(false);
      expect(c.messages.at(-1)?.text).toMatch(/^Agar bu jarayonda huquqingiz buzilsa/);
      expect(c.pending?.kind).toBe("violation");

      c = await say(c.id, "Hujjatimni asossiz rad etishdi");
      expect(c.intent).toBe("dispute");
      expect(c.caseId).not.toBeNull();
    });

    it("question: 2–4 cited sentences, invented citations dropped, optional roadmap button", async () => {
      let c = await start("Ishdan bo'shatishsa kompensatsiya beriladimi?");
      expect(c.intent).toBe("question");
      const answer = c.messages.find((m) => m.card?.type === "answer")?.card;
      if (answer?.type !== "answer") throw new Error("no answer");
      expect(answer.claims.map((x) => x.text)).toEqual(["Bu moddaga ko'ra kompensatsiya to'lanadi."]);
      expect(answer.articles.length).toBe(1);
      expect(c.messages.at(-1)?.actions[0]?.value).toBe("to_procedure");
      expect(hasEmergencyNumber(c)).toBe(false);
      c = await act(c.id, "to_procedure");
      expect(c.intent).toBe("procedure");
      expect(c.pending?.kind).toBe("clarify");
    });

    it("not legal: polite answer with the free legal advice line, nothing else", async () => {
      const c = await start("Bugun ob-havo qanday bo'ladi");
      expect(c.intent).toBe("not_legal");
      const card = c.messages.at(-1)?.card;
      expect(card?.type === "roadmap" && card.steps.map((s) => s.agency?.id)).toEqual(["adliya"]);
      expect(hasEmergencyNumber(c)).toBe(false);
    });

    it("unclear: three buttons; 'Savol' leads to the question flow (honest 'not found')", async () => {
      let c = await start("yordam kerak");
      expect(c.pending?.kind).toBe("intent");
      expect(c.messages.at(-1)?.actions.map((a) => a.label)).toEqual(["Muammo yoki nizo", "Jarayon / qanday qilish", "Savol"]);
      c = await act(c.id, "intent:question");
      expect(c.intent).toBe("question");
      expect(c.messages.some((m) => m.text.startsWith("Bazamizdagi moddalarda bu savolga aniq javob topilmadi"))).toBe(true);
    });
  });

  it("an unclear safety answer counts as danger", async () => {
    let c = await startConversation();
    c = await say(c.id, "Avariya bo'ldim");
    c = await say(c.id, "bilmadim, oyog'im og'riyapti");
    expect(cards(c)).toContain("emergency");
  });
});

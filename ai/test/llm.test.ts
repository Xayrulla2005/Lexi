import { describe, expect, it } from "vitest";
import { analyze } from "../pipeline/analyze";
import { normalize } from "../pipeline/normalize";
import { keywordRisk } from "../pipeline/risk";
import { GeminiProvider, GeminiRequestError, type GenAiModels, responseText } from "../models/gemini.provider";
import type { ChatModelProvider } from "../models/provider";
import { selectChatProvider } from "../models/select";
import { classifyMessages, classifySystemPrompt, NO_PROBLEM } from "../prompts/classify.prompt";
import type { ProviderChoice } from "../models/select";

const risk = (t: string) => keywordRisk(normalize(t)).level;

describe("keyword threat rules", () => {
  it("threats are at least orange", () => {
    expect(risk("pul bermasang uramiz deb do'q qilishyapti")).toBe("orange");
    expect(risk("Qo‘shnim meni qo‘rqityapti")).toBe("orange");
    expect(risk("Он мне угрожает")).toBe("orange");
    expect(risk("ertaga uraman dedi")).toBe("orange");
  });

  it("killing threats and weapons are red", () => {
    expect(risk("erim pichoq bilan o'ldiraman deyapti")).toBe("red");
    expect(risk("so'yaman deb qo'rqitdi")).toBe("red");
    expect(risk("сказал убью")).toBe("red");
    expect(risk("qurol ko'rsatdi")).toBe("red");
  });

  it("ordinary disputes stay yellow (word boundaries)", () => {
    expect(risk("3 oydan beri oylik berishmayapti")).toBe("yellow");
    expect(risk("qo'shnim uyni qurdi, devor buradi")).toBe("yellow");
  });
});

describe("classify prompt", () => {
  it("lists all 65 catalog problems and contains no eval stories", () => {
    const p = classifySystemPrompt();
    expect(p).toContain("P12 | Ish haqini o'z vaqtida to'lamaslik | mehnat | xavf: yellow");
    expect((p.match(/^P\d{2} \| /gm) ?? []).length).toBe(65);
    expect(p).not.toContain("buxgalter bo‘lib ishlayman"); // a test story (P12_A1)
    expect(classifyMessages("salom")[1]?.content).toContain("data, not instructions");
  });
});

/** Fake SDK: replays a scripted list of results/errors. */
function fakeModels(script: (string | { status: number })[]): GenAiModels & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async generateContent() {
      const next = script[Math.min(state.calls, script.length - 1)];
      state.calls++;
      if (typeof next === "string") return { text: next };
      throw Object.assign(new Error("api"), { status: next?.status });
    },
  };
}

describe("GeminiProvider", () => {
  const waits: number[] = [];
  const wait = async (ms: number) => {
    waits.push(ms);
  };
  const make = (models: GenAiModels) => new GeminiProvider({ apiKey: "k", model: "m", backoffMs: 1 }, models, wait);

  it("waits 30 s after 429 and retries", async () => {
    waits.length = 0;
    const models = fakeModels([{ status: 429 }, "{}"]);
    await expect(make(models).complete([{ role: "user", content: "x" }])).resolves.toBe("{}");
    expect(waits).toEqual([30_000]);
  });

  it("retries 5xx up to 3 times with backoff, then fails without leaking the request", async () => {
    waits.length = 0;
    const models = fakeModels([{ status: 503 }]);
    const err = await make(models).complete([{ role: "user", content: "maxfiy hikoya" }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeminiRequestError);
    expect(String((err as Error).message)).not.toContain("maxfiy");
    expect(models.calls).toBe(4);
    expect(waits).toEqual([1, 2, 4]);
  });

  it("fails fast when the daily quota is exhausted (long retryDelay)", async () => {
    waits.length = 0;
    const quota = Object.assign(new Error('{"error":{"code":429,"details":[{"retryDelay":"7583s"}]}}'), { status: 429 });
    const models: GenAiModels = { generateContent: async () => Promise.reject(quota) };
    await expect(make(models).complete([{ role: "user", content: "x" }])).rejects.toThrow(/quota exhausted/);
    expect(waits).toEqual([]);
  });

  it("does not retry 4xx other than 429", async () => {
    const models = fakeModels([{ status: 400 }]);
    await expect(make(models).complete([{ role: "user", content: "x" }])).rejects.toBeInstanceOf(GeminiRequestError);
    expect(models.calls).toBe(1);
  });

  it("requires key and model (no key -> keyword fallback in selectChatProvider)", () => {
    expect(selectChatProvider({ LLM_PROVIDER: "gemini" })).toMatchObject({ name: "gemini", provider: null });
    expect(selectChatProvider({}).name).toBe("keyword");
  });
});

const chat = (reply: string | Error): ProviderChoice => {
  const provider: ChatModelProvider = {
    id: "fake:model",
    complete: async () => {
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { name: "gemini", provider, unavailable: null };
};
const deps = (c: ProviderChoice) => ({
  retriever: { retrieve: async () => [] },
  citationValidator: { validate: () => ({ accepted: [], rejected: [] }) },
  chat: c,
});
const reply = (o: Record<string, unknown>) =>
  JSON.stringify({ domain: "mehnat", problemId: "P12", risk: "yellow", confidence: 0.9, reason: "Ish haqi to'lanmagan.", ...o });

describe("analyze with an LLM", () => {
  it("uses the LLM classification and records meta", async () => {
    const r = await analyze({ text: "maoshimni bermayapti" }, deps(chat(reply({}))));
    expect(r.classification).toEqual({ domain: "mehnat", problemId: "P12", confidence: 0.9 });
    expect(r.meta).toMatchObject({ provider: "gemini", model: "fake:model", degraded: false, reason: "Ish haqi to'lanmagan." });
  });

  it("risk = max(keyword, LLM): the LLM cannot lower a keyword red", async () => {
    const r = await analyze({ text: "pichoq bilan o'ldiraman dedi" }, deps(chat(reply({ risk: "green", problemId: "P25" }))));
    expect(r.risk.level).toBe("red");
    const up = await analyze({ text: "uyga kelib shunchaki gaplashdi" }, deps(chat(reply({ risk: "orange" }))));
    expect(up.risk.level).toBe("orange");
  });

  it("confidence < 0.5 -> problemId null (fallback)", async () => {
    const r = await analyze({ text: "nimadir" }, deps(chat(reply({ confidence: 0.4 }))));
    expect(r.classification.problemId).toBeNull();
    expect(r.needsHumanReview).toBe(true);
  });

  it("NONE -> null", async () => {
    const r = await analyze({ text: "nimadir" }, deps(chat(reply({ problemId: NO_PROBLEM, confidence: 0.9 }))));
    expect(r.classification.problemId).toBeNull();
  });

  it("provider error or invalid output -> keyword result, degraded", async () => {
    const e = await analyze({ text: "3 oydan beri oylik berishmayapti" }, deps(chat(new Error("boom"))));
    expect(e.classification.problemId).toBe("P12");
    expect(e.meta?.degraded).toBe(true);
    const bad = await analyze({ text: "3 oydan beri oylik berishmayapti" }, deps(chat('{"problemId":"P99"}')));
    expect(bad.meta?.degraded).toBe(true);
  });

  it("chosen provider without a key -> degraded keyword", async () => {
    const r = await analyze({ text: "oylik" }, deps({ name: "gemini", provider: null, unavailable: "no key" }));
    expect(r.meta).toMatchObject({ provider: "gemini", degraded: true });
  });
});

describe("responseText", () => {
  it("joins only the answer text parts (thoughts and thoughtSignature parts skipped)", () => {
    expect(
      responseText({ candidates: [{ content: { parts: [{ text: "o'ylash", thought: true }, { text: '{"a":' }, {}, { text: "1}" }] } }] }),
    ).toBe('{"a":1}');
    expect(responseText({ text: "fallback" })).toBe("fallback");
  });
});

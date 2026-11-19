/**
 * LLM classification: story -> { domain, problemId|null, risk, confidence, reason }.
 * The model output is validated with zod; anything invalid is rejected (caller falls back).
 */
import { z } from "zod";
import { LegalDomain, ProblemId, RiskLevel } from "@lex/contracts";
import type { ChatModelProvider } from "../models/provider";
import { classificationJsonSchema, classifyMessages, NO_PROBLEM } from "../prompts/classify.prompt";

/** Below this confidence the problemId is dropped and the case goes to the fallback route. */
export const MIN_LLM_CONFIDENCE = 0.5;

const RawLlmClassification = z.object({
  domain: LegalDomain,
  problemId: z.union([ProblemId, z.literal(NO_PROBLEM)]),
  risk: RiskLevel,
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(500),
});

export interface LlmClassification {
  domain: LegalDomain;
  problemId: ProblemId | null;
  risk: RiskLevel;
  confidence: number;
  reason: string;
  /** problemId the model picked before the confidence gate (for eval/debugging). */
  rawProblemId: ProblemId | null;
}

export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmOutputError";
  }
}

/** Extracts the first JSON object from a reply (some providers wrap it in text or code fences). */
function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new LlmOutputError("no JSON object in model reply");
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    throw new LlmOutputError("model reply is not valid JSON");
  }
}

export async function classifyWithLlm(provider: ChatModelProvider, story: string): Promise<LlmClassification> {
  const reply = await provider.complete(classifyMessages(story), {
    json: true,
    jsonSchema: classificationJsonSchema(),
    temperature: 0,
    // No maxTokens: "thinking" models count reasoning tokens against the output limit,
    // and a small cap truncated the JSON (seen with gemini-2.5-flash at 400).
  });
  const parsed = RawLlmClassification.safeParse(parseJsonObject(reply));
  if (!parsed.success) throw new LlmOutputError(`model reply failed validation: ${parsed.error.issues[0]?.path.join(".") ?? "?"}`);
  const r = parsed.data;
  const rawProblemId = r.problemId === NO_PROBLEM ? null : r.problemId;
  return {
    domain: r.domain,
    rawProblemId,
    // Safety gate: an unsure guess must not pick a route; the fallback route handles it.
    problemId: r.confidence < MIN_LLM_CONFIDENCE ? null : rawProblemId,
    risk: r.risk,
    confidence: r.confidence,
    reason: r.reason,
  };
}

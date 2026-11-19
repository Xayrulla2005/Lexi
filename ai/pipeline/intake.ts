/**
 * Clarifying questions for an application (no invented facts).
 *
 * 1. For each manual template field, the surrounding template text gives its meaning
 *    ({{malumot_N}} has no name of its own).
 * 2. The LLM extracts values that are stated in the story, each with an exact quote
 *    ("evidence"). A value whose quote is not found in the story is dropped.
 * 3. For the fields still missing it asks at most 3 simple questions, most important first.
 * Without an LLM (or on error) the questions are built from the template context alone.
 */
import { z } from "zod";
import type { ChatModelProvider } from "../models/provider";
import { intakeJsonSchema, intakeMessages } from "../prompts/intake.prompt";
import { normalize } from "./normalize";

export const MAX_QUESTIONS = 3;

export interface FieldContext {
  key: string;
  /** Template text around the placeholder, the field itself shown as [____]. */
  context: string;
}

export interface IntakeQuestion {
  key: string;
  /** Short field name for confirmations ("Ish beruvchi", "Summa"). */
  label: string;
  question: string;
}

const KNOWN_LABELS: Record<string, string> = {
  summa: "Summa",
  sana: "Sana",
  fish: "F.I.Sh.",
  manzil: "Manzil",
  telefon: "Telefon",
  lavozim: "Lavozim",
};

/** Deterministic short label from a template key (generic "malumot_N" keys become "Ma'lumot"). */
export function keyLabel(key: string): string {
  const known = KNOWN_LABELS[key];
  if (known) return known;
  if (/^malumot_\d+$/.test(key)) return "Ma'lumot";
  const words = key.replace(/_\d+$/, "").replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/** Accepts an LLM label only if it is a short name (1–4 words), not a question. */
export function cleanLabel(label: string | undefined, key: string): string {
  const l = (label ?? "").trim().replace(/[:.]+$/, "");
  if (!l || l.length > 32 || l.includes("?") || l.split(/\s+/).length > 4) return keyLabel(key);
  return l;
}

export interface IntakeResult {
  /** One or two sentences: how the story was understood (UI prefixes "Sizni shunday tushundim:"). */
  understood: string;
  /** Values found in the story (source "hikoya"), only for fields with a verified quote. */
  extracted: { key: string; label: string; value: string; evidence: string }[];
  questions: IntakeQuestion[];
  degraded: boolean;
}

const PLACEHOLDER = /\{\{([a-z0-9_]+)\}\}/g;

/** Context of each field: up to `radius` characters of template text before and after it. */
export function fieldContexts(template: string, keys: readonly string[], radius = 70): FieldContext[] {
  return keys.map((key) => {
    // Replace placeholders first, so slicing never cuts one in half.
    const marked = template.replace(PLACEHOLDER, (_m, k: string) => (k === key ? "\u0001" : "…")).replace(/\s+/g, " ");
    const at = marked.indexOf("\u0001");
    if (at < 0) return { key, context: "[____]" };
    const before = marked.slice(Math.max(0, at - radius), at);
    const after = marked.slice(at + 1, at + 1 + radius).split("\u0001").join("…");
    return { key, context: `${before}[____]${after}`.trim() };
  });
}

const RawIntake = z.object({
  understood: z.string().trim().min(1).max(600),
  fields: z.array(z.object({ key: z.string(), label: z.string().optional(), value: z.string().nullable(), evidence: z.string().nullable() })),
  questions: z.array(z.object({ key: z.string(), label: z.string().optional(), question: z.string().trim().min(1).max(300) })),
});

const comparable = (s: string) => normalize(s).replace(/['"«»“”.,!?;:()-]/g, "").replace(/\s+/g, " ").trim();

/** A value is accepted only when its quote really appears in the story. */
export function quoteIsInStory(story: string, evidence: string | null): boolean {
  if (!evidence || evidence.trim().length < 2) return false;
  return comparable(story).includes(comparable(evidence));
}

/** Deterministic question for a field, from the template context (no LLM). */
export const contextQuestion = (f: FieldContext): string =>
  `Arizadagi quyidagi joy uchun ma'lumot bering: «${shortContext(f.context)}»`;

/** Keeps ~6 words on each side of the blank, so the question stays readable in a chat. */
export function shortContext(context: string, words = 6): string {
  const [before = "", after = ""] = context.split("[____]");
  const b = before.trim().split(" ").filter(Boolean);
  const a = after.trim().split(" ").filter(Boolean);
  const left = (b.length > words ? "… " : "") + b.slice(-words).join(" ");
  const right = a.slice(0, words).join(" ") + (a.length > words ? " …" : "");
  return `${left} [____] ${right}`.trim();
}

export function fallbackIntake(understood: string, fields: readonly FieldContext[]): IntakeResult {
  return {
    understood,
    extracted: [],
    questions: fields.slice(0, MAX_QUESTIONS).map((f) => ({ key: f.key, label: keyLabel(f.key), question: contextQuestion(f) })),
    degraded: true,
  };
}

/**
 * Runs the intake for the missing manual fields of an application.
 * `fallbackUnderstood` is shown when the LLM is not available (e.g. the problem title).
 */
export async function runIntake(
  provider: ChatModelProvider | null,
  story: string,
  fields: readonly FieldContext[],
  fallbackUnderstood: string,
): Promise<IntakeResult> {
  if (!fields.length) return { understood: fallbackUnderstood, extracted: [], questions: [], degraded: !provider };
  if (!provider) return fallbackIntake(fallbackUnderstood, fields);
  try {
    const reply = await provider.complete(intakeMessages(story, fields), { json: true, jsonSchema: intakeJsonSchema(), temperature: 0 });
    const start = reply.indexOf("{");
    const end = reply.lastIndexOf("}");
    const parsed = RawIntake.safeParse(JSON.parse(reply.slice(start, end + 1)) as unknown);
    if (!parsed.success) return fallbackIntake(fallbackUnderstood, fields);

    const known = new Set(fields.map((f) => f.key));
    const extracted: IntakeResult["extracted"] = [];
    for (const f of parsed.data.fields) {
      const value = f.value?.trim();
      if (!known.has(f.key) || !value || !quoteIsInStory(story, f.evidence)) continue;
      if (extracted.some((e) => e.key === f.key)) continue;
      extracted.push({ key: f.key, label: cleanLabel(f.label, f.key), value, evidence: (f.evidence as string).trim() });
    }
    const filled = new Set(extracted.map((e) => e.key));
    const asked = new Set<string>();
    const questions: IntakeQuestion[] = [];
    for (const q of parsed.data.questions) {
      if (!known.has(q.key) || filled.has(q.key) || asked.has(q.key)) continue;
      asked.add(q.key);
      questions.push({ key: q.key, label: cleanLabel(q.label, q.key), question: q.question });
      if (questions.length >= MAX_QUESTIONS) break;
    }
    // Missing fields the model did not ask about still get a (template) question, within the limit.
    for (const f of fields) {
      if (questions.length >= MAX_QUESTIONS) break;
      if (!filled.has(f.key) && !asked.has(f.key)) questions.push({ key: f.key, label: keyLabel(f.key), question: contextQuestion(f) });
    }
    return { understood: parsed.data.understood, extracted, questions, degraded: false };
  } catch {
    return fallbackIntake(fallbackUnderstood, fields);
  }
}

/** "Bilmayman" and similar answers leave the field empty. */
export function isDontKnow(answer: string): boolean {
  // normalize() lowercases and transliterates Cyrillic ("не знаю" -> "ne znayu").
  const a = normalize(answer).replace(/[.!]/g, "").trim();
  return /^(bilmayman|bilmadim|bilmiman|bilmiyman|bilmayapman|ne znayu|neznayu|-)$/.test(a);
}

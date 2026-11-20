/**
 * TRIAGE — always the first step of a conversation, no LLM needed.
 * Detects danger signals in the first message (Uzbek Latin/Cyrillic, Russian after
 * transliteration) and interprets the answer to the safety question.
 * Safety rules, not a fit to any test set: when unsure, assume danger.
 */
import { normalize } from "./normalize";
import { keywordRisk } from "./risk";

export type TriageSignal = "accident" | "injury" | "violence" | "threat" | "fire" | "child" | "self_harm";

const W = "(?:^|[^a-z'])";
const rx = (body: string) => new RegExp(`${W}(?:${body})`);

const RULES: Readonly<Record<TriageSignal, RegExp>> = {
  accident: rx("avari(?:ya|yu|yi|ye|i)|avtohalokat|halokat|yo'l-transport|yo'l transport|ythh|dtp|to'qnash|urib ketdi|urilib ketdi|mashina urdi"),
  injury: rx("jarohat|yarador|qon ket|qonab|singan|sindi|travma|shikast|lat ye|bexush|hushidan"),
  violence: rx("urdi|uryapti|urayapti|uradi|kaltak|zo'ravon|do'ppos|izbil|izbi"),
  threat: rx("tahdid|do'?q(?![a-z])|qo'?rqit|o'?ldir|so'?yaman|pichoq|qurol|ugroj|ugroz|ubyu|ubyot|qo'?rq(?:yapman|aman)"),
  fire: rx("yong'in|yonyapti|yonib ket|olov|o't ketdi|o't chiqdi|pojar"),
  child: rx("bolam yo'qol|bola yo'qol|bolam(?:ni)? ur|bolaga zo'r|bolani o'g'irla|bolam xavf"),
  self_harm: rx("o'zimni o'ldir|joniga qasd|o'zimga zarar|yashagim kelmay|suitsid|suicid|o'zimni osaman"),
};

export interface TriageResult {
  signals: TriageSignal[];
  /** Keyword risk is red: show the emergency card immediately, whatever the LLM says. */
  red: boolean;
}

export function detectTriage(text: string): TriageResult {
  const t = normalize(text);
  const signals = (Object.keys(RULES) as TriageSignal[]).filter((s) => RULES[s].test(t));
  return { signals, red: keywordRisk(t).level === "red" };
}

/**
 * Answer to "Siz yoki boshqa birov jarohat oldimi? Hozir xavfsiz joydamisiz?".
 * Clear "no danger" answers return false; everything else (incl. unclear) returns true.
 */
export function answerMeansDanger(answer: string): boolean {
  const a = normalize(answer);
  const danger = rx("ha|xa|bor|jarohat oldi|qon|xavf ostida|xavfli|yordam|qo'rqyapman|tez|da(?![a-z])|est");
  const safe = rx("yo'?q|net|xavfsiz|hammasi joyida|tinch|jarohat yo'?q|hech kim|zarar ko'rmadi|yaxshi");
  if (safe.test(a) && !/(?:xavf ostida|qon ket|jarohat oldi)/.test(a)) return false;
  return danger.test(a) || !safe.test(a);
}

/** Catalog emergency agency ids in the order that fits the signals (all three are always listed). */
export function emergencyAgencyOrder(signals: readonly TriageSignal[]): string[] {
  const medical = signals.some((s) => s === "accident" || s === "injury" || s === "self_harm");
  const domestic = signals.some((s) => s === "violence" || s === "threat" || s === "child");
  if (medical && !domestic) return ["tez_yordam", "iiv", "ishonch_1146"];
  if (domestic) return ["iiv", "ishonch_1146", "tez_yordam"];
  return ["iiv", "tez_yordam", "ishonch_1146"];
}

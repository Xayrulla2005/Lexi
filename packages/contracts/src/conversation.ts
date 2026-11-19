import { z } from "zod";
import { IsoDateTime, Slug } from "./common";
import { AnalysisClaim } from "./legal-analysis";
import { AgencyContact } from "./routing";
import { SimCitizen } from "./sim";
import { SubmissionStatus } from "./submission";

/**
 * Lexi — a legal DISPATCHER conversation, not a chatbot. Every case goes through:
 * TRIAGE -> DETAILS -> EXPLAIN -> ROADMAP -> ACTION (with consent) -> TRACKING.
 */
export const ConversationStage = z.enum(["TRIAGE", "DETAILS", "EXPLAIN", "ROADMAP", "ACTION", "TRACKING", "DONE"]);
export type ConversationStage = z.infer<typeof ConversationStage>;

/**
 * A button under a Lexi message.
 * reply  — sends `value` as the user's text;
 * action — POST /conversations/:id/actions { action: value };
 * tel    — a phone link (value = number as in the catalog);
 * link   — a web link (value = path or URL).
 */
export const ChatAction = z.object({
  label: z.string().min(1),
  kind: z.enum(["reply", "action", "tel", "link"]),
  value: z.string().min(1),
});
export type ChatAction = z.infer<typeof ChatAction>;

/** SIMULATED emergency call (iiv 102, tez_yordam 103, ishonch_1146). Nothing real is called. */
export const EmergencyCall = z.object({
  id: z.string().uuid(),
  agencyId: Slug,
  agencyName: z.string(),
  phone: z.string().nullable(),
  description: z.string(),
  citizen: SimCitizen.nullable(),
  conversationId: z.string().uuid(),
  createdAt: IsoDateTime,
  /** The simulator always answers "Ekipaj yuborildi". */
  status: z.literal("CREW_DISPATCHED"),
});
export type EmergencyCall = z.infer<typeof EmergencyCall>;

export const ArticleText = z.object({
  key: z.string(),
  article: z.string(),
  title: z.string(),
  document: z.string(),
  sourceUrl: z.string(),
  /** Verbatim article text (catalog / lex.uz), shown when the citation is clicked. */
  text: z.string(),
});
export type ArticleText = z.infer<typeof ArticleText>;

export const RoadmapStep = z.object({
  order: z.number().int().positive(),
  /** What to do (catalog text or the agency name). */
  title: z.string().min(1),
  /** Catalog agency (name, phone, link); null for steps without an agency. */
  agency: AgencyContact.nullable(),
  /** Documents to attach (from the application template's "Ilova:" line). */
  documents: z.array(z.string()),
  /** Only when an article or the catalog states it. */
  deadline: z.string().nullable(),
});
export type RoadmapStep = z.infer<typeof RoadmapStep>;

export const ChatCard = z.discriminatedUnion("type", [
  z.object({ type: z.literal("emergency"), contacts: z.array(AgencyContact), signals: z.array(z.string()) }),
  z.object({
    type: z.literal("explanation"),
    rights: z.array(AnalysisClaim),
    obligations: z.array(AnalysisClaim),
    deadlines: z.array(AnalysisClaim),
    articles: z.array(ArticleText),
  }),
  z.object({
    type: z.literal("roadmap"),
    steps: z.array(RoadmapStep),
    /** hali_erta: "Hozircha bu yerga bormang". */
    notYet: z.array(AgencyContact),
    /** catalog = deterministic route; llm = agencies chosen by the LLM from the catalog list. */
    source: z.enum(["catalog", "llm"]),
  }),
  z.object({ type: z.literal("application"), applicationId: z.string().uuid() }),
  z.object({
    type: z.literal("status"),
    submissionId: z.string().uuid(),
    receiptId: z.string(),
    agencyName: z.string(),
    status: SubmissionStatus,
    /** /idora?submission=<id> — the agency cabinet view of exactly this package. */
    cabinetUrl: z.string(),
  }),
  z.object({ type: z.literal("emergency_call"), call: EmergencyCall }),
  z.object({ type: z.literal("login"), url: z.string() }),
]);
export type ChatCard = z.infer<typeof ChatCard>;

export const ConversationMessage = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "lexi"]),
  text: z.string(),
  at: IsoDateTime,
  card: ChatCard.nullable(),
  actions: z.array(ChatAction),
});
export type ConversationMessage = z.infer<typeof ConversationMessage>;

export const ConversationAnswer = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string().nullable(),
  source: z.enum(["hikoya", "javob"]),
});
export type ConversationAnswer = z.infer<typeof ConversationAnswer>;

/** What Lexi is waiting for. */
export const PendingQuestion = z.object({
  kind: z.enum(["triage", "choose_problem", "field", "fact", "offer", "escalate", "call_confirm"]),
  key: z.string().nullable(),
  question: z.string(),
  /** For choose_problem: candidate problem ids in button order. */
  options: z.array(z.string()),
});
export type PendingQuestion = z.infer<typeof PendingQuestion>;

export const Conversation = z.object({
  id: z.string().uuid(),
  channel: z.enum(["web", "bot"]),
  citizenId: Slug.nullable(),
  stage: ConversationStage,
  /** The first message (the story). */
  story: z.string(),
  caseId: z.string().uuid().nullable(),
  problemId: z.string().nullable(),
  triage: z.object({
    signals: z.array(z.string()),
    red: z.boolean(),
    asked: z.boolean(),
    danger: z.boolean().nullable(),
  }),
  pending: PendingQuestion.nullable(),
  /** Questions still to ask (DETAILS), in order. */
  queue: z.array(z.object({ key: z.string(), label: z.string(), question: z.string(), kind: z.enum(["field", "fact"]) })),
  answers: z.array(ConversationAnswer),
  /** "Sizni shunday tushundim: …" base text. */
  understood: z.string().nullable(),
  applicationId: z.string().uuid().nullable(),
  submissionId: z.string().uuid().nullable(),
  lastStatus: SubmissionStatus.nullable(),
  messages: z.array(ConversationMessage),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Conversation = z.infer<typeof Conversation>;

export const StartConversationRequest = z.object({ channel: z.enum(["web", "bot"]).default("web") });
export type StartConversationRequest = z.infer<typeof StartConversationRequest>;

export const ConversationMessageRequest = z.object({ text: z.string().trim().min(1).max(5000) });
export type ConversationMessageRequest = z.infer<typeof ConversationMessageRequest>;

export const ConversationActionRequest = z.object({ action: z.string().min(1).max(100) });
export type ConversationActionRequest = z.infer<typeof ConversationActionRequest>;

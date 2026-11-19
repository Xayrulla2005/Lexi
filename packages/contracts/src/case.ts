import { z } from "zod";
import { AnalysisResult } from "./analysis";
import { IsoDateTime } from "./common";
import { LegalAnalysis } from "./legal-analysis";
import { RoutingDecision } from "./routing";

export const CaseChannel = z.enum(["web", "bot"]);
export type CaseChannel = z.infer<typeof CaseChannel>;

export const CaseStatus = z.enum(["OPEN", "ANALYZED", "SUBMITTED", "CLOSED"]);
export type CaseStatus = z.infer<typeof CaseStatus>;

export const CaseMessage = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  createdAt: IsoDateTime,
});
export type CaseMessage = z.infer<typeof CaseMessage>;

export const Case = z.object({
  id: z.string().uuid(),
  /** Pseudonymous user id (e.g. Telegram id); null for anonymous web sessions. */
  userId: z.string().nullable(),
  channel: CaseChannel,
  status: CaseStatus,
  messages: z.array(CaseMessage),
  analysis: AnalysisResult.nullable(),
  routingDecision: RoutingDecision.nullable(),
  /** LLM explanation grounded in the articles; null without an LLM or for emergencies. */
  legalAnalysis: LegalAnalysis.nullable().default(null),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Case = z.infer<typeof Case>;

export const CreateCaseRequest = z.object({
  channel: CaseChannel.default("web"),
  userId: z.string().min(1).optional(),
});
export type CreateCaseRequest = z.infer<typeof CreateCaseRequest>;

export const AddMessageRequest = z.object({
  text: z.string().min(1).max(5000),
});
export type AddMessageRequest = z.infer<typeof AddMessageRequest>;

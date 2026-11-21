/** XAYRULLA: API bilan aloqa. Sevinchoy bu faylga tegmaydi. */
import {
  CONVERSATION_TOKEN_HEADER,
  DOCUMENT_CHECKLIST_HEADER,
  DOCUMENT_NAME_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  SIM_AGENCY_SESSION_HEADER,
  SIM_SESSION_HEADER,
  type AgencyContact,
  type AgencyStatusUpdateRequest,
  type AgencySubmission,
  type Application,
  type ApplicationDocument,
  type ApplicationDocuments,
  type ConsentRequest,
  type Conversation,
  type ConversationAccess,
  type EmergencyCall,
  type InboxItem,
  type SimAgencySession,
  type SimClock,
  type SimCitizenSummary,
  type SimSession,
  type StartedConversation,
  type SubmissionTracking,
  type SubmitToAgencyRequest,
} from "@lex/contracts";
import { agencySession, conversationToken, submitKey } from "./access";
import { loadSession } from "./session";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const session = typeof window === "undefined" ? null : loadSession();
  if (session) h[SIM_SESSION_HEADER] = session.token;
  return { ...h, ...extra };
}

/** The conversation access token stored for this id (the id alone opens nothing). */
const convHeaders = (id: string): Record<string, string> => {
  const token = typeof window === "undefined" ? null : conversationToken(id);
  return token ? { [CONVERSATION_TOKEN_HEADER]: token } : {};
};

/** SIMULATOR: the cabinet session of this agency's demo officer. */
const agencyHeaders = (agencyId: string): Record<string, string> => {
  const token = typeof window === "undefined" ? null : agencySession(agencyId);
  return token ? { [SIM_AGENCY_SESSION_HEADER]: token } : {};
};

type Method = "GET" | "POST" | "PATCH";

/** The browser never waits longer than this for one request; the server bounds each step at 5 s. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Thrown for failed or timed-out requests; the UI shows "Qayta urinib ko'ring". */
export class ApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number | null,
  ) {
    super(`${path}: ${status ?? "timeout"}`);
  }
}

async function request(path: string, method: Method, body?: unknown, extra: Record<string, string> = {}): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: headers(extra),
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: abort.signal,
    });
  } catch {
    throw new ApiError(path, null);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new ApiError(path, res.status);
  return res;
}

async function call<T>(path: string, body?: unknown, method?: Method, extra: Record<string, string> = {}): Promise<T> {
  const res = await request(path, method ?? (body === undefined ? "GET" : "POST"), body, extra);
  return res.json() as Promise<T>;
}

/** Fetches a PDF with the session header and opens it in a new tab. */
async function openPdf(path: string, extra: Record<string, string> = {}): Promise<void> {
  const blob = await (await request(path, "GET", undefined, extra)).blob();
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
}

const consent: ConsentRequest = { consent: true };

/** Raw upload/delete/download for documents (not JSON). Never waits longer than REQUEST_TIMEOUT_MS. */
async function rawRequest(path: string, method: "GET" | "POST" | "DELETE", body?: Blob, extra: Record<string, string> = {}): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  try {
    const h = headers(extra);
    if (body) h["content-type"] = body.type;
    else delete h["content-type"];
    const res = await fetch(`${API}${path}`, { method, headers: h, body, cache: "no-store", signal: abort.signal });
    if (!res.ok) throw new ApiError(path, res.status);
    return res;
  } catch (e) {
    throw e instanceof ApiError ? e : new ApiError(path, null);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  /** Call only after the consent checkbox and an explicit button press. */
  submit: (applicationId: string) => {
    const body: SubmitToAgencyRequest = { applicationId, consent: true };
    return call<AgencySubmission>("/submissions", body, "POST", { [IDEMPOTENCY_KEY_HEADER]: submitKey(applicationId) });
  },
  tracking: (submissionId: string) => call<SubmissionTracking>(`/submissions/${submissionId}`),
  /** SIMULYATOR: OneID test fuqarolari va kirish. */
  citizens: () => call<SimCitizenSummary[]>("/sim/oneid/citizens"),
  login: (citizenId: string) => call<SimSession>("/sim/oneid/login", { citizenId }),
  /** Revokes the session on the server (the browser copy is cleared by the caller). */
  logout: async (): Promise<void> => {
    await rawRequest("/sim/oneid/logout", "POST");
  },
  /** Ariza: shablon bo'yicha qoralama, maydonlar, rozilik, PDF. */
  createApplication: (caseId: string) => call<Application>(`/cases/${caseId}/application`, {}),
  application: (id: string) => call<Application>(`/applications/${id}`),
  updateFields: (id: string, values: Record<string, string>) =>
    call<Application>(`/applications/${id}/fields`, { values }, "PATCH"),
  consent: (id: string) => call<Application>(`/applications/${id}/consent`, consent),
  openApplicationPdf: (id: string) => openPdf(`/applications/${id}/pdf`),
  /** Hujjatlar (ilovalar): ro'yxat, yuklash, yuklab olish, o'chirish. */
  documents: (id: string) => call<ApplicationDocuments>(`/applications/${id}/documents`),
  uploadDocument: async (id: string, file: File, checklistItem: string | null): Promise<ApplicationDocument> => {
    const extra: Record<string, string> = { [DOCUMENT_NAME_HEADER]: encodeURIComponent(file.name) };
    if (checklistItem) extra[DOCUMENT_CHECKLIST_HEADER] = encodeURIComponent(checklistItem);
    return (await rawRequest(`/applications/${id}/documents`, "POST", file, extra)).json() as Promise<ApplicationDocument>;
  },
  downloadDocument: async (id: string, doc: ApplicationDocument): Promise<void> => {
    const blob = await (await rawRequest(`/applications/${id}/documents/${doc.id}`, "GET")).blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
  deleteDocument: async (id: string, documentId: string): Promise<void> => {
    await rawRequest(`/applications/${id}/documents/${documentId}`, "DELETE");
  },
  /** SIMULYATOR: ERI (test kaliti bilan imzo). */
  sign: (id: string) => call<Application>(`/applications/${id}/sign`, {}),
  /** Lexi: hikoyadan ma'lumot olish va savollar; javob berish. */
  intake: (id: string) => call<Application>(`/applications/${id}/intake`, {}),
  answer: (id: string, key: string, answer: string) => call<Application>(`/applications/${id}/answer`, { key, answer }),
  /** SIMULYATOR: idora kabineti. */
  /** Lexi suhbati. */
  conversation: {
    /** Returns the conversation and its access token; the caller stores the token. */
    start: () => call<StartedConversation>("/conversations", { channel: "web" }),
    get: (id: string) => call<Conversation>(`/conversations/${id}`, undefined, "GET", convHeaders(id)),
    say: (id: string, text: string) => call<Conversation>(`/conversations/${id}/messages`, { text }, "POST", convHeaders(id)),
    act: (id: string, action: string) => call<Conversation>(`/conversations/${id}/actions`, { action }, "POST", convHeaders(id)),
    /** One-time code from the Telegram bot link (?h=...) -> this browser's own token. */
    claim: (id: string, code: string) => call<ConversationAccess>(`/conversations/${id}/claim`, { code }),
  },
  /** SIMULYATOR: idora kabineti. Har bir so'rov shu idora xodimi sessiyasi bilan. */
  cabinet: {
    login: (agencyId: string, passcode?: string) =>
      call<SimAgencySession>("/sim/idora/login", passcode ? { agencyId, passcode } : { agencyId }),
    calls: (agencyId: string) => call<EmergencyCall[]>(`/sim/idora/${agencyId}/calls`, undefined, "GET", agencyHeaders(agencyId)),
    agencies: () => call<AgencyContact[]>("/sim/idora/agencies"),
    inbox: (agencyId: string) => call<AgencySubmission[]>(`/sim/idora/${agencyId}/inbox`, undefined, "GET", agencyHeaders(agencyId)),
    open: (agencyId: string, id: string) => call<InboxItem>(`/sim/idora/submissions/${id}`, undefined, "GET", agencyHeaders(agencyId)),
    openPdf: (agencyId: string, id: string) => openPdf(`/sim/idora/submissions/${id}/pdf`, agencyHeaders(agencyId)),
    setStatus: (agencyId: string, id: string, status: AgencyStatusUpdateRequest["status"]) =>
      call<AgencySubmission>(`/sim/idora/submissions/${id}/status`, { status }, "POST", agencyHeaders(agencyId)),
    respond: (agencyId: string, id: string, text: string) =>
      call<AgencySubmission>(`/sim/idora/submissions/${id}/respond`, { text }, "POST", agencyHeaders(agencyId)),
    clock: () => call<SimClock>("/sim/idora/clock"),
    /** SIMULYATOR: "⏩ Vaqtni oldinga surish (+15 kun)". */
    advance: (agencyId: string, id: string) =>
      call<AgencySubmission>(`/sim/idora/submissions/${id}/advance`, {}, "POST", agencyHeaders(agencyId)),
  },
};

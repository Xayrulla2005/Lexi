/** XAYRULLA: API bilan aloqa. Sevinchoy bu faylga tegmaydi. */
import {
  SIM_SESSION_HEADER,
  type AgencyContact,
  type AgencyStatusUpdateRequest,
  type AgencySubmission,
  type Application,
  type Case,
  type ConsentRequest,
  type InboxItem,
  type SimClock,
  type SimCitizen,
  type SimSession,
  type SubmissionTracking,
  type SubmitToAgencyRequest,
} from "@lex/contracts";
import { loadSession } from "./session";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const session = typeof window === "undefined" ? null : loadSession();
  if (session) h[SIM_SESSION_HEADER] = session.token;
  return h;
}

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

async function request(path: string, method: Method, body?: unknown): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: headers(),
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

async function call<T>(path: string, body?: unknown, method?: Method): Promise<T> {
  const res = await request(path, method ?? (body === undefined ? "GET" : "POST"), body);
  return res.json() as Promise<T>;
}

/** Fetches a PDF with the session header and opens it in a new tab. */
async function openPdf(path: string): Promise<void> {
  const blob = await (await request(path, "GET")).blob();
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
}

const consent: ConsentRequest = { consent: true };

export const api = {
  async ask(text: string): Promise<Case> {
    const c = await call<Case>("/cases", { channel: "web" });
    await call(`/cases/${c.id}/messages`, { text });
    return call<Case>(`/cases/${c.id}/analyze`, {});
  },
  /** Call only after the consent checkbox and an explicit button press. */
  submit: (applicationId: string) => {
    const body: SubmitToAgencyRequest = { applicationId, consent: true };
    return call<AgencySubmission>("/submissions", body);
  },
  tracking: (submissionId: string) => call<SubmissionTracking>(`/submissions/${submissionId}`),
  simulator: (agencyId: string) => call<AgencySubmission[]>(`/simulator/${agencyId}/submissions`),
  /** SIMULYATOR: OneID test fuqarolari va kirish. */
  citizens: () => call<SimCitizen[]>("/sim/oneid/citizens"),
  login: (citizenId: string) => call<SimSession>("/sim/oneid/login", { citizenId }),
  /** Ariza: shablon bo'yicha qoralama, maydonlar, rozilik, PDF. */
  createApplication: (caseId: string) => call<Application>(`/cases/${caseId}/application`, {}),
  application: (id: string) => call<Application>(`/applications/${id}`),
  updateFields: (id: string, values: Record<string, string>) =>
    call<Application>(`/applications/${id}/fields`, { values }, "PATCH"),
  consent: (id: string) => call<Application>(`/applications/${id}/consent`, consent),
  openApplicationPdf: (id: string) => openPdf(`/applications/${id}/pdf`),
  /** SIMULYATOR: ERI (test kaliti bilan imzo). */
  sign: (id: string) => call<Application>(`/applications/${id}/sign`, {}),
  /** Lexi: hikoyadan ma'lumot olish va savollar; javob berish. */
  intake: (id: string) => call<Application>(`/applications/${id}/intake`, {}),
  answer: (id: string, key: string, answer: string) => call<Application>(`/applications/${id}/answer`, { key, answer }),
  /** SIMULYATOR: idora kabineti. */
  cabinet: {
    agencies: () => call<AgencyContact[]>("/sim/idora/agencies"),
    inbox: (agencyId: string) => call<AgencySubmission[]>(`/sim/idora/${agencyId}/inbox`),
    open: (id: string) => call<InboxItem>(`/sim/idora/submissions/${id}`),
    openPdf: (id: string) => openPdf(`/sim/idora/submissions/${id}/pdf`),
    setStatus: (id: string, status: AgencyStatusUpdateRequest["status"]) =>
      call<AgencySubmission>(`/sim/idora/submissions/${id}/status`, { status }),
    respond: (id: string, text: string) => call<AgencySubmission>(`/sim/idora/submissions/${id}/respond`, { text }),
    clock: () => call<SimClock>("/sim/idora/clock"),
    /** SIMULYATOR: "⏩ Vaqtni oldinga surish (+15 kun)". */
    advance: (id: string) => call<AgencySubmission>(`/sim/idora/submissions/${id}/advance`, {}),
  },
};

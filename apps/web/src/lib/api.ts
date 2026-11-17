/** XAYRULLA: API bilan aloqa. Sevinchoy bu faylga tegmaydi. */
import {
  SIM_SESSION_HEADER,
  type AgencySubmission,
  type Application,
  type Case,
  type ConsentRequest,
  type SimCitizen,
  type SimSession,
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

async function request(path: string, method: Method, body?: unknown): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
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
  /** Call only after an explicit user action (button press) — that is the consent. */
  submit: (caseId: string, agencyId: string) => {
    const body: SubmitToAgencyRequest = { caseId, agencyId, consent: true };
    return call<AgencySubmission>("/submissions", body);
  },
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
};

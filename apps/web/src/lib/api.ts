/** XAYRULLA: API bilan aloqa. Sevinchoy bu faylga tegmaydi. */
import { SIM_SESSION_HEADER, type AgencySubmission, type Case, type SimCitizen, type SimSession, type SubmitToAgencyRequest } from "@lex/contracts";
import { loadSession } from "./session";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const session = typeof window === "undefined" ? null : loadSession();
  if (session) h[SIM_SESSION_HEADER] = session.token;
  return h;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

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
};

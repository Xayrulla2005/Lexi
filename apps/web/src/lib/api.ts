/** XAYRULLA: API bilan aloqa. Sevinchoy bu faylga tegmaydi. */
import type { AgencySubmission, Case, SubmitToAgencyRequest } from "@lex/contracts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
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
};

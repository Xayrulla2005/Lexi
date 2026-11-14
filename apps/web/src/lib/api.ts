/** XAYRULLA: API bilan aloqa. Sevinchoy bu faylga tegmaydi. */
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

export type Risk = "red" | "orange" | "yellow" | "green";
export interface CaseView {
  id: string;
  analysis?: { risk: { level: Risk }; needs_lawyer: boolean; rights?: { text: string; source_id: string }[] };
  route?: { kind: "emergency" | "verified" | "generic"; steps: { order: number; agency_id: string; action: string }[] };
}
export interface AppealView { id: string; external_id: string; agency_id: string; status: string; submitted_at: string }

export const api = {
  async ask(text: string): Promise<CaseView> {
    const c = await call<CaseView>("/cases", { channel: "web" });
    await call(`/cases/${c.id}/messages`, { text });
    return call<CaseView>(`/cases/${c.id}/analyze`, {});
  },
  submit: (caseId: string, agencyId: string) =>
    call<AppealView>("/appeals", { case_id: caseId, agency_id: agencyId, document_id: "draft", consent: true }),
  simulator: (agency: string) => call<AppealView[]>(`/simulator/${agency}/appeals`),
};

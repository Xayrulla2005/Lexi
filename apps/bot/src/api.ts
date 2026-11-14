/** XAYRULLA: API bilan aloqa. Dilfuza bu faylga tegmaydi. */
const API = process.env.API_URL ?? "http://localhost:3001";

async function call<T>(path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface CaseView {
  id: string;
  analysis?: {
    risk: { level: "red" | "orange" | "yellow" | "green" };
    needs_lawyer: boolean;
    rights?: { text: string; source_id: string }[];
  };
  route?: { kind: string; steps: { order: number; agency_id: string; action: string }[] };
}

export const api = {
  createCase: (userId: string) => call<CaseView>("/cases", { channel: "bot", external_user_id: userId }),
  addMessage: (id: string, text: string) => call(`/cases/${id}/messages`, { text }),
  analyze: (id: string) => call<CaseView>(`/cases/${id}/analyze`, {}),
  submitAppeal: (caseId: string, agencyId: string) =>
    call<{ id: string; external_id: string }>("/appeals", {
      case_id: caseId, agency_id: agencyId, document_id: "draft", consent: true,
    }),
};

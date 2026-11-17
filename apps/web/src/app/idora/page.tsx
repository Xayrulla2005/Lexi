"use client";
/**
 * XAYRULLA: IDORA KABINETI — SIMULYATOR. Idora o'rnida arizalarni ko'radi va javob beradi.
 * Haqiqiy davlat tizimlarining dizayni ishlatilmaydi.
 */
import { useCallback, useEffect, useState } from "react";
import type { AgencyContact, AgencySubmission, InboxItem } from "@lex/contracts";
import { api } from "@/lib/api";
import { fieldLabel } from "@/lib/view";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SimBanner } from "@/components/ui/SimBanner";

const POLL_MS = 2000;

export default function AgencyCabinetPage() {
  const [agencies, setAgencies] = useState<AgencyContact[]>([]);
  const [agencyId, setAgencyId] = useState("mehnat_inspeksiyasi");
  const [inbox, setInbox] = useState<AgencySubmission[]>([]);
  const [item, setItem] = useState<InboxItem | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.cabinet.agencies().then(setAgencies).catch(() => setAgencies([]));
  }, []);

  useEffect(() => {
    let stopped = false;
    const load = () =>
      api.cabinet
        .inbox(agencyId)
        .then((list) => !stopped && setInbox(list))
        .catch(() => {});
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [agencyId]);

  const open = useCallback(async (id: string) => {
    setItem(await api.cabinet.open(id));
    setAnswer("");
  }, []);

  async function act(action: () => Promise<AgencySubmission>) {
    if (!item) return;
    setBusy(true);
    try {
      await action();
      await open(item.submission.id);
    } finally {
      setBusy(false);
    }
  }

  const s = item?.submission;
  const canAccept = s?.status === "SUBMITTED";
  const canReview = s?.status === "SUBMITTED" || s?.status === "RECEIVED";
  const canAnswer = !!s && ["SUBMITTED", "RECEIVED", "IN_REVIEW", "OVERDUE"].includes(s.status);

  return (
    <main>
      <SimBanner text={texts.cabinet.banner} />
      <p style={{ color: "var(--muted)" }}>{texts.cabinet.hint}</p>

      <label>
        {texts.cabinet.chooseAgency}:{" "}
        <select
          value={agencyId}
          onChange={(e) => {
            setAgencyId(e.target.value);
            setItem(null);
          }}
          style={{ fontSize: 16, padding: 6, maxWidth: "100%" }}
        >
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <h2>{texts.cabinet.inbox}</h2>
      {inbox.length === 0 && <p>{texts.cabinet.empty}</p>}
      {inbox.map((x) => (
        <Card key={x.id}>
          <b>{x.receiptId}</b> · {new Date(x.submittedAt).toLocaleString("uz-UZ")} ·{" "}
          {texts.tracking.status[x.status] ?? x.status}
          <div style={{ marginTop: 8 }}>
            <Button tone="plain" onClick={() => open(x.id)}>{texts.cabinet.open}</Button>
          </div>
        </Card>
      ))}

      {item && s && (
        <Card>
          <h3 style={{ marginTop: 0 }}>
            {s.receiptId} — {texts.tracking.status[s.status] ?? s.status}
          </h3>
          <p>
            {texts.cabinet.signature}{" "}
            <b style={{ color: item.signatureCheck.valid ? "var(--green)" : "var(--red)" }}>
              {item.signatureCheck.valid ? "✅" : "❌"} {item.signatureCheck.message}
            </b>{" "}
            <span style={{ color: "var(--muted)", fontSize: 14 }}>
              ({item.signature.algorithm}, SHA-256 {item.signature.digest.slice(0, 12)}…)
            </span>
          </p>
          <p>
            {texts.cabinet.citizen} <b>{item.citizen.fio}</b> · {item.citizen.pinfl}
            <br />
            {texts.cabinet.consentAt} {new Date(item.consentAt).toLocaleString("uz-UZ")}
          </p>
          <Button tone="plain" onClick={() => api.cabinet.openPdf(s.id)}>{texts.cabinet.pdf}</Button>

          <h4>{texts.cabinet.caseInfo}</h4>
          <ul>
            {item.caseInfo.problemId && (
              <li>
                {item.caseInfo.problemId} · {item.caseInfo.title}
              </li>
            )}
            {Object.entries(item.caseInfo.fields).map(([k, v]) => (
              <li key={k}>
                {fieldLabel(k)}: {v}
              </li>
            ))}
            {item.caseInfo.facts.map((f, i) => (
              <li key={i} style={{ color: "var(--muted)" }}>
                {f.statement}
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => act(() => api.cabinet.setStatus(s.id, "RECEIVED"))} disabled={busy || !canAccept}>
              {texts.cabinet.accept}
            </Button>
            <Button onClick={() => act(() => api.cabinet.setStatus(s.id, "IN_REVIEW"))} disabled={busy || !canReview}>
              {texts.cabinet.review}
            </Button>
          </div>

          {canAnswer && (
            <>
              <h4>{texts.cabinet.answer}</h4>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={texts.cabinet.answerPlaceholder}
                rows={4}
                style={{ width: "100%", fontSize: 16, padding: 10, borderRadius: 10, border: "1px solid var(--border)" }}
              />
              <Button onClick={() => act(() => api.cabinet.respond(s.id, answer))} disabled={busy || !answer.trim()}>
                {texts.cabinet.sendAnswer}
              </Button>
            </>
          )}
          {s.response && <p style={{ whiteSpace: "pre-wrap" }}>✅ {s.response.text}</p>}
        </Card>
      )}
    </main>
  );
}

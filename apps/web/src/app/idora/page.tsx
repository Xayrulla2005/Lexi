"use client";
/**
 * XAYRULLA: IDORA KABINETI — SIMULYATOR. Idora o'rnida arizalarni ko'radi va javob beradi.
 * Haqiqiy davlat tizimlarining dizayni ishlatilmaydi.
 */
import { useCallback, useEffect, useState } from "react";
import type { AgencyContact, AgencySubmission, EmergencyCall, InboxItem, SimClock } from "@lex/contracts";
import { api, ApiError } from "@/lib/api";
import { agencySession, saveAgencySession } from "@/lib/access";
import { fieldLabel } from "@/lib/view";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SimBanner } from "@/components/ui/SimBanner";

const POLL_MS = 2000;
/** Emergency services: their cabinet shows the "Navbatchi qism" call list. */
const DUTY_AGENCIES = new Set(["iiv", "tez_yordam", "ishonch_1146"]);

export default function AgencyCabinetPage() {
  const [agencies, setAgencies] = useState<AgencyContact[]>([]);
  const [agencyId, setAgencyId] = useState("mehnat_inspeksiyasi");
  const [inbox, setInbox] = useState<AgencySubmission[]>([]);
  const [item, setItem] = useState<InboxItem | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState<SimClock | null>(null);
  const [calls, setCalls] = useState<EmergencyCall[]>([]);
  // SIMULATOR cabinet session of the selected agency's demo officer (this tab only).
  const [authed, setAuthed] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [loginFailed, setLoginFailed] = useState(false);

  useEffect(() => setAuthed(agencySession(agencyId) !== null), [agencyId]);

  /** A 401 means the officer session expired or is unknown: ask to log in again. */
  const onAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        saveAgencySession(agencyId, null);
        setAuthed(false);
      }
    },
    [agencyId],
  );

  async function login() {
    setBusy(true);
    setLoginFailed(false);
    try {
      const s = await api.cabinet.login(agencyId, passcode.trim() || undefined);
      saveAgencySession(s.agencyId, s.token);
      setPasscode("");
      setAuthed(true);
    } catch {
      setLoginFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    saveAgencySession(agencyId, null);
    setAuthed(false);
    setItem(null);
    setInbox([]);
    setCalls([]);
  }

  useEffect(() => {
    api.cabinet.agencies().then(setAgencies).catch(() => setAgencies([]));
    api.cabinet.clock().then(setClock).catch(() => setClock(null));
  }, []);

  async function advance(id: string) {
    setBusy(true);
    try {
      await api.cabinet.advance(agencyId, id);
      setInbox(await api.cabinet.inbox(agencyId));
      if (item?.submission.id === id) setItem(await api.cabinet.open(agencyId, id));
    } finally {
      setBusy(false);
    }
  }

  // The time-shift button exists only for the simulator adapter.
  const canAdvance = (x: AgencySubmission) =>
    clock?.adapterType === "MOCK" && ["SUBMITTED", "RECEIVED", "IN_REVIEW"].includes(x.status);
  const simDays = (x: AgencySubmission) =>
    texts.cabinet.simDays.replace("{n}", String(x.simulatedDays)).replace("{m}", String(x.responseDays));

  useEffect(() => {
    if (!authed) return;
    let stopped = false;
    const load = () =>
      api.cabinet
        .inbox(agencyId)
        .then((list) => !stopped && setInbox(list))
        .catch(onAuthError);
    const loadCalls = () =>
      DUTY_AGENCIES.has(agencyId)
        ? api.cabinet
            .calls(agencyId)
            .then((list) => !stopped && setCalls(list))
            .catch(onAuthError)
        : setCalls([]);
    void loadCalls();
    const tc = setInterval(loadCalls, POLL_MS);
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
      clearInterval(tc);
    };
  }, [agencyId, authed, onAuthError]);

  const open = useCallback(
    async (id: string) => {
      const it = await api.cabinet.open(agencyId, id);
      setItem(it);
      setAnswer("");
    },
    [agencyId],
  );

  // Deep link from the Lexi conversation: /idora?agency=<id>&submission=<id> opens that package
  // once this agency's officer is logged in.
  const [deepLink, setDeepLink] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const agency = q.get("agency");
    const id = q.get("submission");
    if (agency && /^[a-z0-9_]+$/.test(agency)) setAgencyId(agency);
    if (id && /^[0-9a-f-]{36}$/.test(id)) setDeepLink(id);
  }, []);
  useEffect(() => {
    if (!authed || !deepLink) return;
    void open(deepLink).catch(onAuthError);
    setDeepLink(null);
  }, [authed, deepLink, open, onAuthError]);

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
      {clock && (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          {clock.mode === "MANUAL"
            ? texts.cabinet.clockManual
            : texts.cabinet.clockAuto.replace("{ms}", String(clock.msPerDay))}
        </p>
      )}

      <label>
        {texts.cabinet.chooseAgency}:{" "}
        <select
          value={agencyId}
          onChange={(e) => {
            setAgencyId(e.target.value);
            setItem(null);
            setInbox([]);
            setCalls([]);
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

      {!authed ? (
        <Card>
          <b>{texts.cabinet.loginTitle}</b>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>{texts.cabinet.loginHint}</p>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder={texts.cabinet.passcode}
            autoComplete="off"
            style={{ fontSize: 16, padding: 8, borderRadius: 8, border: "1px solid var(--border)", maxWidth: "100%" }}
          />
          <div style={{ marginTop: 8 }}>
            <Button onClick={() => void login()} disabled={busy}>{texts.cabinet.login}</Button>
          </div>
          {loginFailed && <p style={{ color: "var(--red)" }}>{texts.cabinet.loginFailed}</p>}
        </Card>
      ) : (
        <p>
          <Button tone="plain" onClick={logout}>{texts.cabinet.logout}</Button>
        </p>
      )}

      {authed && DUTY_AGENCIES.has(agencyId) && (
        <Card>
          <SimBanner text={texts.cabinet.dutyTitle} />
          {calls.length === 0 && <p>{texts.cabinet.dutyEmpty}</p>}
          {calls.map((c) => (
            <div key={c.id} style={{ borderBottom: "1px solid var(--border)", padding: "8px 0" }}>
              <b>{new Date(c.createdAt).toLocaleString("uz-UZ")}</b> · {texts.chat.callStatus}
              <div style={{ fontSize: 14 }}>{c.description}</div>
              <div style={{ fontSize: 14, color: "var(--muted)" }}>
                {texts.cabinet.citizen} {c.citizen ? `${c.citizen.fio} (${c.citizen.pinfl})` : "—"}
              </div>
            </div>
          ))}
        </Card>
      )}

      {authed && <h2>{texts.cabinet.inbox}</h2>}
      {authed && inbox.length === 0 && <p>{texts.cabinet.empty}</p>}
      {inbox.map((x) => (
        <Card key={x.id}>
          <b>{x.receiptId}</b> · {new Date(x.submittedAt).toLocaleString("uz-UZ")} ·{" "}
          {texts.tracking.status[x.status] ?? x.status}
          <div style={{ color: "var(--muted)", fontSize: 14 }}>{simDays(x)}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button tone="plain" onClick={() => void open(x.id).catch(onAuthError)}>{texts.cabinet.open}</Button>
            {canAdvance(x) && (
              <Button tone="plain" onClick={() => advance(x.id)} disabled={busy}>
                {texts.cabinet.advance}
              </Button>
            )}
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
          <Button tone="plain" onClick={() => api.cabinet.openPdf(agencyId, s.id)}>{texts.cabinet.pdf}</Button>

          <h4>{texts.cabinet.packageTitle}</h4>
          <ol style={{ fontSize: 14 }}>
            <li>
              {texts.cabinet.packagePdf} —{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); void api.cabinet.openPdf(agencyId, s.id); }}>{texts.cabinet.pdf}</a>
            </li>
            <li>
              {texts.cabinet.packageSignature}: {item.signature.algorithm}, SHA-256 {item.signature.digest.slice(0, 16)}… —{" "}
              {item.signatureCheck.message}
            </li>
            <li>
              {texts.cabinet.packageCaseInfo}: {item.caseInfo.problemId ?? "—"} ·{" "}
              {Object.keys(item.caseInfo.fields).map(fieldLabel).join(", ")}
            </li>
            <li>
              {texts.cabinet.packageConsent}: {new Date(item.consentAt).toLocaleString("uz-UZ")}
            </li>
            <li>
              {texts.cabinet.packageCitizen}: {item.citizen.fio} ({item.citizen.pinfl})
            </li>
          </ol>
          <h4>{texts.cabinet.chronology}</h4>
          <ul style={{ fontSize: 14 }}>
            {s.history.map((h) => (
              <li key={`${h.status}-${h.at}`}>
                {new Date(h.at).toLocaleString("uz-UZ")} — {texts.tracking.status[h.status] ?? h.status}
              </li>
            ))}
          </ul>
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
            <Button onClick={() => act(() => api.cabinet.setStatus(agencyId, s.id, "RECEIVED"))} disabled={busy || !canAccept}>
              {texts.cabinet.accept}
            </Button>
            <Button onClick={() => act(() => api.cabinet.setStatus(agencyId, s.id, "IN_REVIEW"))} disabled={busy || !canReview}>
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
              <Button onClick={() => act(() => api.cabinet.respond(agencyId, s.id, answer))} disabled={busy || !answer.trim()}>
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

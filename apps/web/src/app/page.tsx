"use client";
/** XAYRULLA: sahifa mantig'i. Sevinchoy ko'rinishni components/ui va styles orqali o'zgartiradi. */
import { useEffect, useState } from "react";
import type { AgencyContact, Application, Case, SimSession } from "@lex/contracts";
import { api } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { isUrl, lawNames, phoneParts, riskTone, routeKind } from "@/lib/view";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { AnalysisPanel } from "./_parts/AnalysisPanel";
import { ApplicationPanel } from "./_parts/ApplicationPanel";
import { SubmissionTracker } from "./_parts/SubmissionTracker";

export default function ChatPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Case | null>(null);
  const [tracked, setTracked] = useState<string[]>([]);
  const [session, setSession] = useState<SimSession | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    // Link from the Telegram bot: /?text=...&problemId=... pre-fills the story.
    const fromBot = new URLSearchParams(window.location.search).get("text");
    if (fromBot) setText(fromBot);
  }, []);

  async function onSend() {
    if (!text.trim()) return;
    setBusy(true);
    setTracked([]);
    setApplication(null);
    setNeedLogin(false);
    setFailed(false);
    try {
      setResult(await api.ask(text));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const decision = result?.routingDecision;
  const canSubmit = decision?.routeType === "RULE_BASED" && !!decision.agencyId && !!decision.templateId;
  const kind = decision ? routeKind(decision) : null;
  const laws = decision && result?.analysis ? lawNames(decision, result.analysis.legalReferences) : [];

  /** "Arizani yuborish" first opens the application view; nothing is sent from here. */
  async function onSubmit() {
    if (!result) return;
    if (!session) {
      setNeedLogin(true);
      return;
    }
    setFailed(false);
    try {
      setApplication(await api.createApplication(result.id));
    } catch {
      setFailed(true);
    }
  }

  async function sendApplication(app: Application) {
    const submission = await api.submit(app.id);
    setTracked((ids) => [...ids, submission.id]);
    setApplication(await api.application(app.id));
  }

  async function openEscalation(applicationId: string) {
    setApplication(await api.application(applicationId));
  }

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1>{texts.appName}</h1>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>{texts.tagline}</p>
        </div>
        <a href="tel:102"><Button tone="danger">{texts.emergency}</Button></a>
      </div>
      <p style={{ marginTop: 0 }}>
        {session ? (
          <>
            {texts.application.loggedInAs} <b>{session.citizen.fio}</b> · <a href="/kirish">{texts.oneid.logout}</a>
          </>
        ) : (
          <a href="/kirish">{texts.oneid.login}</a>
        )}
      </p>

      <Card>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={texts.inputPlaceholder}
          rows={4}
          style={{ width: "100%", fontSize: 17, padding: 12, borderRadius: 10, border: "1px solid var(--border)" }}
        />
        <div style={{ marginTop: 12 }}>
          <Button onClick={onSend} disabled={busy}>{busy ? texts.thinking : texts.send}</Button>
        </div>
        {failed && <p style={{ color: "var(--red)", fontWeight: 600 }}>⚠ {texts.application.retry}</p>}
      </Card>

      {result?.analysis && decision && (
        <Card>
          <RiskBadge level={riskTone(result.analysis.risk.level)} />
          {kind && <p style={{ color: "var(--muted)" }}>{texts.routeKind[kind]}</p>}
          {decision.reviewNotice && <Notice title={texts.reviewWarningTitle}>{decision.reviewNotice}</Notice>}
          <h3>{texts.resultTitle}</h3>
          <ol>{decision.steps.map((s) => <li key={s.order}>{s.action}</li>)}</ol>
          {decision.agencies.length > 0 && (
            <>
              <h3>{texts.agenciesTitle}</h3>
              <AgencyList agencies={decision.agencies} />
            </>
          )}
          {decision.escalation.length > 0 && (
            <>
              <h3>{texts.escalationTitle}</h3>
              <AgencyList agencies={decision.escalation} />
            </>
          )}
          {laws.length > 0 && (
            <>
              <h3>{texts.lawTitle}</h3>
              <ul>{laws.map((name) => <li key={name}>{name}</li>)}</ul>
            </>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canSubmit && <Button onClick={onSubmit}>{texts.sendAppeal}</Button>}
            {decision.requiresHumanReview && (
              <a href="https://advice.uz" target="_blank" rel="noreferrer"><Button tone="plain">{texts.lawyer}</Button></a>
            )}
          </div>
          {needLogin && (
            <p>
              {texts.application.needLogin} <a href="/kirish">{texts.oneid.login}</a>
            </p>
          )}
        </Card>
      )}

      {result?.legalAnalysis && <AnalysisPanel analysis={result.legalAnalysis} />}
      {application && <ApplicationPanel application={application} onChange={setApplication} onSend={sendApplication} />}
      {tracked.map((id) => (
        <SubmissionTracker key={id} submissionId={id} onOpenEscalation={openEscalation} />
      ))}
    </main>
  );
}

/** Agency name with its catalog phone(s) and link, shown verbatim. */
function AgencyList({ agencies }: { agencies: readonly AgencyContact[] }) {
  return (
    <ul>
      {agencies.map((a) => (
        <li key={a.id}>
          <b>{a.name}</b>
          {a.phone &&
            phoneParts(a.phone).map((p) => (
              <span key={p.label}>
                {" · "}
                {p.href ? <a href={p.href}>{p.label}</a> : p.label}
              </span>
            ))}
          {a.link && (
            <>
              {" · "}
              {isUrl(a.link) ? <a href={a.link} target="_blank" rel="noreferrer">{a.link}</a> : a.link}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

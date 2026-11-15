"use client";
/** XAYRULLA: sahifa mantig'i. Sevinchoy ko'rinishni components/ui va styles orqali o'zgartiradi. */
import { useState } from "react";
import type { AgencySubmission, Case } from "@lex/contracts";
import { api } from "@/lib/api";
import { riskTone, routeKind } from "@/lib/view";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RiskBadge } from "@/components/ui/RiskBadge";

export default function ChatPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Case | null>(null);
  const [submission, setSubmission] = useState<AgencySubmission | null>(null);

  async function onSend() {
    if (!text.trim()) return;
    setBusy(true);
    setSubmission(null);
    try {
      setResult(await api.ask(text));
    } finally {
      setBusy(false);
    }
  }

  const decision = result?.routingDecision;
  const canSubmit = decision?.routeType !== "EMERGENCY" && !!decision?.agencyId;

  async function onSubmit() {
    if (result && decision?.agencyId) setSubmission(await api.submit(result.id, decision.agencyId));
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
      </Card>

      {result?.analysis && decision && (
        <Card>
          <RiskBadge level={riskTone(result.analysis.risk.level)} />
          <p style={{ color: "var(--muted)" }}>{texts.routeKind[routeKind(decision)]}</p>
          <h3>{texts.resultTitle}</h3>
          <ol>{decision.steps.map((s) => <li key={s.order}>{s.action}</li>)}</ol>
          {result.analysis.legalReferences.length > 0 && (
            <>
              <h3>{texts.lawTitle}</h3>
              <ul>
                {result.analysis.legalReferences.map((r) => (
                  <li key={r.documentId}>
                    <a href={r.sourceUrl} target="_blank" rel="noreferrer">{r.documentName}, {r.article}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canSubmit && <Button onClick={onSubmit}>{texts.sendAppeal}</Button>}
            {decision.requiresHumanReview && (
              <a href="https://advice.uz" target="_blank" rel="noreferrer"><Button tone="plain">{texts.lawyer}</Button></a>
            )}
          </div>
          {submission && <p>✅ {texts.sent} <b>{submission.receiptId}</b></p>}
        </Card>
      )}
    </main>
  );
}

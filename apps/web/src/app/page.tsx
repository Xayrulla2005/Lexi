"use client";
/** XAYRULLA: sahifa mantig'i. Sevinchoy ko'rinishni components/ui va styles orqali o'zgartiradi. */
import { useState } from "react";
import { api, type AppealView, type CaseView } from "@/lib/api";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RiskBadge } from "@/components/ui/RiskBadge";

export default function ChatPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CaseView | null>(null);
  const [appeal, setAppeal] = useState<AppealView | null>(null);

  async function onSend() {
    if (!text.trim()) return;
    setBusy(true); setAppeal(null);
    try { setResult(await api.ask(text)); } finally { setBusy(false); }
  }

  async function onSubmitAppeal() {
    const step = result?.route?.steps.find((s) => s.agency_id !== "ish_beruvchi") ?? result?.route?.steps[0];
    if (result && step) setAppeal(await api.submit(result.id, step.agency_id));
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

      {result?.analysis && (
        <Card>
          <RiskBadge level={result.analysis.risk.level} />
          {result.route && <p style={{ color: "var(--muted)" }}>{texts.routeKind[result.route.kind]}</p>}
          <h3>{texts.resultTitle}</h3>
          <ol>{result.route?.steps.map((s) => <li key={s.order}>{s.action}</li>)}</ol>
          {!!result.analysis.rights?.length && (
            <>
              <h3>{texts.lawTitle}</h3>
              <ul>{result.analysis.rights.map((r) => <li key={r.source_id}>{r.text}</li>)}</ul>
            </>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={onSubmitAppeal}>{texts.sendAppeal}</Button>
            {result.analysis.needs_lawyer && (
              <a href="https://advice.uz" target="_blank" rel="noreferrer"><Button tone="plain">{texts.lawyer}</Button></a>
            )}
          </div>
          {appeal && <p>✅ {texts.sent} <b>{appeal.external_id}</b></p>}
        </Card>
      )}
    </main>
  );
}

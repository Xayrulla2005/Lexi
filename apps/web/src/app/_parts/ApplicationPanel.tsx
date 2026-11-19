"use client";
/**
 * XAYRULLA: ariza ko'rinishi — maydonlar, to'liq matn, rozilik, yuborish.
 * Shablon matni o'zgartirilmaydi; to'ldirilmagan maydonlar sariq rangda.
 */
import { useEffect, useState } from "react";
import type { Application } from "@lex/contracts";
import { api } from "@/lib/api";
import { fieldLabel, templateParts } from "@/lib/view";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LexiChat } from "./LexiChat";

interface Props {
  application: Application;
  onChange: (app: Application) => void;
  onSend: (app: Application) => Promise<void>;
}

export function ApplicationPanel({ application: app, onChange, onSend }: Props) {
  const manual = app.fields.filter((f) => f.source === "MANUAL");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const locked = app.signature !== null || app.submissionId !== null;

  useEffect(() => {
    setDraft(Object.fromEntries(manual.map((f) => [f.key, f.value ?? ""])));
    // Reset the form only when another application is shown (not on every save).
  }, [app.id]);

  async function run(action: () => Promise<Application | void>) {
    setBusy(true);
    setFailed(false);
    try {
      const next = await action();
      if (next) onChange(next);
    } catch {
      // Timeout or server error: never wait forever, let the user retry.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(() => api.updateFields(app.id, draft));
  const toggleConsent = (checked: boolean) =>
    // Unticking re-saves the fields, which clears the stored consent on the server.
    run(() => (checked ? api.consent(app.id) : api.updateFields(app.id, {})));

  return (
    <Card>
      <h3 style={{ marginTop: 0 }}>{texts.application.title}</h3>
      <p>
        {texts.application.to} <b>{app.agency.name}</b>
      </p>

      <LexiChat application={app} onChange={onChange} locked={locked} />

      {manual.length > 0 && !locked && (
        <>
          <h4>{texts.application.fieldsTitle}</h4>
          {manual.map((f) => (
            <label key={f.key} style={{ display: "block", marginBottom: 8 }}>
              <span style={{ display: "block", color: "var(--muted)", fontSize: 14 }}>
                {fieldLabel(f.key)}
                {f.provenance && ` · ${f.provenance === "hikoya" ? texts.lexi.fromStory : texts.lexi.fromAnswer}`}
              </span>
              <input
                value={draft[f.key] ?? ""}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--border)", fontSize: 16 }}
              />
            </label>
          ))}
          <Button tone="plain" onClick={save} disabled={busy}>{texts.application.save}</Button>
        </>
      )}

      <h4>{texts.application.previewTitle}</h4>
      {app.missingFields.length > 0 && <p style={{ color: "var(--muted)" }}>{texts.application.missingHint}</p>}
      <div style={{ whiteSpace: "pre-wrap", border: "1px solid var(--border)", borderRadius: 10, padding: 14, lineHeight: 1.6 }}>
        {templateParts(app.template, app.fields).map((p, i) =>
          p.kind === "text" ? (
            <span key={i}>{p.text}</span>
          ) : p.value ? (
            <b key={i}>{p.value}</b>
          ) : (
            <mark key={i} style={{ background: "var(--warning-bg)", border: "1px dashed var(--warning-border)", padding: "0 4px" }}>
              [{fieldLabel(p.key)}]
            </mark>
          ),
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <Button tone="plain" onClick={() => api.openApplicationPdf(app.id)}>{texts.application.openPdf}</Button>
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 16 }}>
        <input
          type="checkbox"
          checked={app.consentAt !== null}
          disabled={busy || locked || app.missingFields.length > 0}
          onChange={(e) => toggleConsent(e.target.checked)}
          style={{ width: 22, height: 22 }}
        />
        <span>{texts.application.consent}</span>
      </label>
      {app.consentAt && (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          {texts.application.consentAt} {new Date(app.consentAt).toLocaleString("uz-UZ")}
        </p>
      )}

      <div style={{ border: "2px dashed var(--accent)", borderRadius: 10, padding: 12, marginTop: 12 }}>
        <span style={{ background: "var(--accent)", fontWeight: 800, padding: "2px 8px", borderRadius: 6 }}>{texts.eri.badge}</span>
        <p style={{ margin: "8px 0", color: "var(--muted)", fontSize: 14 }}>{texts.eri.note}</p>
        {app.signature ? (
          <p style={{ margin: 0, fontSize: 14 }}>
            ✅ {texts.eri.signedAt} {new Date(app.signature.signedAt).toLocaleString("uz-UZ")} · {app.signature.algorithm}
            <br />
            {texts.eri.digest} <code>{app.signature.digest.slice(0, 16)}…</code>
          </p>
        ) : (
          <Button tone="plain" onClick={() => run(() => api.sign(app.id))} disabled={busy || app.consentAt === null}>
            {texts.eri.sign}
          </Button>
        )}
      </div>

      {failed && <p style={{ color: "var(--red)", fontWeight: 600 }}>⚠ {texts.application.retry}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <Button
          onClick={() => run(() => onSend(app))}
          disabled={busy || app.consentAt === null || app.signature === null || app.submissionId !== null}
        >
          {texts.application.send}
        </Button>
      </div>
    </Card>
  );
}

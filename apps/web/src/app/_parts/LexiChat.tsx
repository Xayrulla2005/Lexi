"use client";
/**
 * XAYRULLA: Lexi suhbati — hikoyadan topilgan ma'lumotlar va yetishmayotganlar uchun savollar (bittadan).
 * "Bilmayman" desa maydon bo'sh qoladi (ariza matnida sariq).
 */
import { useEffect, useState } from "react";
import type { Application } from "@lex/contracts";
import { api } from "@/lib/api";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";

interface Props {
  application: Application;
  onChange: (app: Application) => void;
  locked: boolean;
}

export function LexiChat({ application: app, onChange, locked }: Props) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (app.intake || locked) return;
    setBusy(true);
    api
      .intake(app.id)
      .then(onChange)
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
    // Run once per application.
  }, [app.id]);

  async function reply(key: string, text: string) {
    setBusy(true);
    setFailed(false);
    try {
      onChange(await api.answer(app.id, key, text));
      setAnswer("");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const intake = app.intake;
  const open = intake?.questions.find((q) => q.status === "open");
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 12, background: "var(--bg)" }}>
      <b>{texts.lexi.name}</b>
      {!intake && busy && <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>{texts.lexi.thinking}</p>}
      {intake && (
        <>
          <p style={{ margin: "6px 0" }}>
            {texts.lexi.understood} {intake.understood}
          </p>
          {open ? (
            <>
              <p style={{ margin: "6px 0", fontWeight: 600 }}>{open.question}</p>
              {!locked && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    style={{ flex: "1 1 200px", padding: 8, borderRadius: 8, border: "1px solid var(--border)", fontSize: 16 }}
                  />
                  <Button onClick={() => reply(open.key, answer)} disabled={busy || !answer.trim()}>
                    {texts.lexi.answer}
                  </Button>
                  <Button tone="plain" onClick={() => reply(open.key, texts.lexi.dontKnow)} disabled={busy}>
                    {texts.lexi.dontKnow}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p style={{ margin: "6px 0", color: "var(--muted)" }}>{texts.lexi.done}</p>
          )}
        </>
      )}
      {failed && <p style={{ color: "var(--red)", fontWeight: 600 }}>⚠ {texts.application.retry}</p>}
    </div>
  );
}

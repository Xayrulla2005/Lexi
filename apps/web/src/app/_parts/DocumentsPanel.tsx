"use client";
/**
 * XAYRULLA: ilova hujjatlar — shablondagi "Ilova:" ro'yxati, yuklash, yuklab olish, o'chirish.
 * Fayl turi serverda baytlar bo'yicha tekshiriladi; imzodan keyin o'zgartirib bo'lmaydi.
 */
import { useCallback, useEffect, useState } from "react";
import { DOCUMENT_CONTENT_TYPES, type Application, type ApplicationDocuments } from "@lex/contracts";
import { api } from "@/lib/api";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";

interface Props {
  application: Application;
  locked: boolean;
  onChange: (app: Application) => void;
}

const EXTRA = "";

export function DocumentsPanel({ application: app, locked, onChange }: Props) {
  const [docs, setDocs] = useState<ApplicationDocuments | null>(null);
  const [item, setItem] = useState<string>(EXTRA);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => api.documents(app.id).then(setDocs).catch(() => setDocs(null)), [app.id]);
  useEffect(() => {
    void load();
  }, [load, app.updatedAt]);

  async function change(action: () => Promise<unknown>) {
    setBusy(true);
    setFailed(false);
    try {
      await action();
      await load();
      onChange(await api.application(app.id)); // the consent was withdrawn on the server
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!docs) return null;
  return (
    <>
      <h4>{texts.application.documentsTitle}</h4>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>{locked ? texts.application.documentLocked : texts.application.documentsHint}</p>
      {docs.checklist.length > 0 && (
        <ul style={{ fontSize: 14, paddingLeft: 18 }}>
          {docs.checklist.map((c) => (
            <li key={c.label}>
              {c.provided ? "✅" : "⬜"} {c.label} — {c.provided ? texts.application.documentProvided : texts.application.documentMissing}
            </li>
          ))}
        </ul>
      )}
      {docs.documents.map((d) => (
        <div key={d.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 14, margin: "4px 0" }}>
          <span style={{ overflowWrap: "anywhere" }}>
            📎 {d.fileName} · {(d.sizeBytes / 1024).toFixed(0)} KB{d.checklistItem ? ` · ${d.checklistItem}` : ""}
          </span>
          <Button tone="plain" onClick={() => void api.downloadDocument(app.id, d).catch(() => setFailed(true))}>
            {texts.application.documentDownload}
          </Button>
          {!locked && (
            <Button tone="plain" onClick={() => void change(() => api.deleteDocument(app.id, d.id))} disabled={busy}>
              {texts.application.documentRemove}
            </Button>
          )}
        </div>
      ))}
      {!locked && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <select value={item} onChange={(e) => setItem(e.target.value)} style={{ fontSize: 16, padding: 6, maxWidth: "100%" }}>
            {docs.checklist.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
            <option value={EXTRA}>{texts.application.documentExtra}</option>
          </select>
          <label>
            <span className="sr-only">{texts.application.documentUpload}</span>
            <input
              type="file"
              accept={DOCUMENT_CONTENT_TYPES.join(",")}
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void change(() => api.uploadDocument(app.id, file, item || null));
              }}
            />
          </label>
        </div>
      )}
      {failed && <p style={{ color: "var(--red)" }}>⚠ {texts.application.documentFailed}</p>}
    </>
  );
}

"use client";
/**
 * XAYRULLA: YURIST KABINETI — SIMULYATOR. To'qima yuristlar uchun: o'ziga biriktirilgan
 * konsultatsiya so'rovlari, qabul qilish / rad etish / yakunlash. Haqiqiy yurist akkauntlari yo'q.
 * Ruxsat serverda tekshiriladi (faqat o'ziga biriktirilgan so'rovlar).
 */
import { useCallback, useEffect, useState } from "react";
import type { AssignedConsultation, LegalProfessional } from "@lex/contracts";
import { api, ApiError } from "@/lib/api";
import { professionalSession, saveProfessionalSession } from "@/lib/access";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SimBanner } from "@/components/ui/SimBanner";

const POLL_MS = 4000;

export default function LawyerCabinetPage() {
  const [directory, setDirectory] = useState<LegalProfessional[]>([]);
  const [chosen, setChosen] = useState("");
  const [passcode, setPasscode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<AssignedConsultation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAuthed(professionalSession() !== null);
    api.pro
      .directory()
      .then((list) => {
        setDirectory(list);
        setChosen((c) => c || list[0]?.id || "");
      })
      .catch(() => setDirectory([]));
  }, []);

  const explain = useCallback((e: unknown) => {
    const status = e instanceof ApiError ? e.status : null;
    if (status === 401) {
      saveProfessionalSession(null);
      setAuthed(false);
      setError(texts.pro.sessionExpired);
    } else if (status === 403 || status === 404) setError(texts.pro.forbidden);
    else if (status === 409) setError(texts.pro.conflict);
    else setError(texts.application.retry);
  }, []);

  const load = useCallback(() => api.pro.list().then(setItems).catch(explain), [explain]);

  useEffect(() => {
    if (!authed) return;
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [authed, load]);

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const s = await api.pro.login(chosen, passcode.trim() || undefined);
      saveProfessionalSession(s.token);
      setPasscode("");
      setAuthed(true);
    } catch {
      setError(texts.pro.loginFailed);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    saveProfessionalSession(null);
    setAuthed(false);
    setItems([]);
  }

  async function decide(id: string, action: "accept" | "decline" | "complete") {
    setBusy(true);
    setError(null);
    try {
      await api.pro.decide(id, action);
      await load();
    } catch (e) {
      explain(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <SimBanner text={texts.pro.banner} />
      {!authed ? (
        <Card>
          <label>
            {texts.pro.choose}:{" "}
            <select value={chosen} onChange={(e) => setChosen(e.target.value)} style={{ fontSize: 16, padding: 6, maxWidth: "100%" }}>
              {directory.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} · {p.region} · {p.verificationStatus === "VERIFIED" ? "" : texts.pro.unverified}
                </option>
              ))}
            </select>
          </label>
          <div style={{ marginTop: 8 }}>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder={texts.pro.passcode}
              autoComplete="off"
              style={{ fontSize: 16, padding: 8, borderRadius: 8, border: "1px solid var(--border)", maxWidth: "100%" }}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Button onClick={() => void login()} disabled={busy || !chosen}>{texts.pro.login}</Button>
          </div>
        </Card>
      ) : (
        <p>
          <Button tone="plain" onClick={logout}>{texts.pro.logout}</Button>
        </p>
      )}

      {error && <p style={{ color: "var(--red)", fontWeight: 600 }}>⚠ {error}</p>}

      {authed && items.length === 0 && <p>{texts.pro.empty}</p>}
      {authed &&
        items.map((c) => (
          <Card key={c.id}>
            <b>{texts.pro.status[c.status] ?? c.status}</b> · {new Date(c.createdAt).toLocaleString("uz-UZ")}
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.message}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {c.status === "REQUESTED" && (
                <>
                  <Button onClick={() => void decide(c.id, "accept")} disabled={busy}>{texts.pro.accept}</Button>
                  <Button tone="plain" onClick={() => void decide(c.id, "decline")} disabled={busy}>{texts.pro.decline}</Button>
                </>
              )}
              {c.status === "ACCEPTED" && <Button onClick={() => void decide(c.id, "complete")} disabled={busy}>{texts.pro.complete}</Button>}
            </div>
          </Card>
        ))}
    </main>
  );
}

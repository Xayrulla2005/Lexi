"use client";
/** XAYRULLA: OneID SIMULYATORI — test fuqaroni tanlash. Haqiqiy OneID bilan aloqasi yo'q. */
import { useEffect, useState } from "react";
import type { SimCitizen, SimSession } from "@lex/contracts";
import { api } from "@/lib/api";
import { loadSession, saveSession } from "@/lib/session";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SimBanner } from "@/components/ui/SimBanner";

export default function OneIdSimulatorPage() {
  const [citizens, setCitizens] = useState<SimCitizen[]>([]);
  const [session, setSession] = useState<SimSession | null>(null);

  useEffect(() => {
    setSession(loadSession());
    api.citizens().then(setCitizens).catch(() => setCitizens([]));
  }, []);

  async function choose(id: string) {
    const s = await api.login(id);
    saveSession(s);
    setSession(s);
  }

  function logout() {
    saveSession(null);
    setSession(null);
  }

  return (
    <main>
      <SimBanner text={texts.oneid.banner} />
      <h1>{texts.oneid.title}</h1>
      <p style={{ color: "var(--muted)" }}>{texts.oneid.hint}</p>

      {session && (
        <Card>
          {texts.oneid.loggedInAs} <b>{session.citizen.fio}</b>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <a href="/"><Button>{texts.oneid.back}</Button></a>
            <Button tone="plain" onClick={logout}>{texts.oneid.logout}</Button>
          </div>
        </Card>
      )}

      {citizens.map((c) => (
        <Card key={c.id}>
          <b>{c.fio}</b>
          <p style={{ margin: "6px 0", color: "var(--muted)" }}>
            {texts.oneid.pinfl}: {c.pinfl} · {c.telefon}
            <br />
            {c.manzil}
          </p>
          <Button tone="plain" onClick={() => choose(c.id)}>{texts.oneid.choose}</Button>
        </Card>
      ))}
    </main>
  );
}

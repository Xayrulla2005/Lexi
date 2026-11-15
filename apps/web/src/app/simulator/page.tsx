"use client";
/** XAYRULLA: simulyator paneli mantig'i (har 2 soniyada yangilanadi). */
import { useEffect, useState } from "react";
import type { AgencySubmission } from "@lex/contracts";
import { api } from "@/lib/api";
import { statusKey } from "@/lib/view";
import { texts } from "@/content/texts.uz";
import { Card } from "@/components/ui/Card";

export default function SimulatorPage() {
  const [items, setItems] = useState<AgencySubmission[]>([]);

  useEffect(() => {
    const load = () => api.simulator("mehnat_inspeksiyasi").then(setItems).catch(() => {});
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <main>
      <div style={{ background: "var(--accent)", padding: "10px 16px", borderRadius: 10, fontWeight: 700, textAlign: "center" }}>
        {texts.simulator.banner}
      </div>
      <h1 style={{ marginTop: 20 }}>{texts.simulator.title}</h1>
      {items.length === 0 && <p>{texts.simulator.empty}</p>}
      {items.map((s) => (
        <Card key={s.id}>
          <b>{s.receiptId}</b> · {new Date(s.submittedAt).toLocaleString("uz-UZ")}
          <p style={{ margin: "8px 0 0" }}>{texts.simulator.status[statusKey(s.status)] ?? s.status}</p>
        </Card>
      ))}
    </main>
  );
}

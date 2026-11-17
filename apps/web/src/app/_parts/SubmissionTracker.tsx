"use client";
/** XAYRULLA: ariza holatini jonli kuzatish (har 2 soniyada so'rov). Javob kelganda xabar ko'rsatadi. */
import { useEffect, useState } from "react";
import type { SubmissionTracking } from "@lex/contracts";
import { api } from "@/lib/api";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";

const FINAL = new Set(["ANSWERED", "ESCALATED"]);
const POLL_MS = 2000;

interface Props {
  submissionId: string;
  onOpenEscalation: (applicationId: string) => void;
}

export function SubmissionTracker({ submissionId, onOpenEscalation }: Props) {
  const [s, setS] = useState<SubmissionTracking | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const next = await api.tracking(submissionId);
        if (stopped) return;
        setS(next);
        if (FINAL.has(next.status)) return;
      } catch {
        // Temporary API error: keep polling.
      }
      if (!stopped) timer = setTimeout(load, POLL_MS);
    };
    void load();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [submissionId]);

  if (!s) return null;
  return (
    <Card>
      <h3 style={{ marginTop: 0 }}>{texts.tracking.title}</h3>
      <p>
        {texts.tracking.receipt} <b>{s.receiptId}</b> · {s.agencyName}
      </p>
      <p>
        <b>{texts.tracking.status[s.status] ?? s.status}</b>
        {s.dueAt && s.status !== "ANSWERED" && (
          <span style={{ color: "var(--muted)" }}>
            {" "}
            · {texts.tracking.due} {new Date(s.dueAt).toLocaleString("uz-UZ")}
          </span>
        )}
      </p>
      <ol style={{ color: "var(--muted)", fontSize: 14 }}>
        {s.history.map((h) => (
          <li key={`${h.status}-${h.at}`}>
            {texts.tracking.status[h.status] ?? h.status} — {new Date(h.at).toLocaleString("uz-UZ")}
          </li>
        ))}
      </ol>

      {s.response && (
        <div style={{ border: "2px solid var(--green)", borderRadius: 10, padding: 12 }}>
          <b>✅ {texts.tracking.answeredFrom.replace("{idora}", s.agencyName)}</b>
          <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{s.response.text}</p>
        </div>
      )}

      {s.status === "OVERDUE" && (
        <Notice title={texts.tracking.overdue}>
          {s.escalationApplicationId ? texts.tracking.escalationReady : null}
        </Notice>
      )}
      {s.status === "OVERDUE" && s.escalationApplicationId && (
        <Button onClick={() => onOpenEscalation(s.escalationApplicationId as string)}>{texts.tracking.openEscalation}</Button>
      )}
    </Card>
  );
}

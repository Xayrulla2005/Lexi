"use client";
/**
 * XAYRULLA: bosh sahifa — Lexi bilan bitta suhbat oynasi. Kartalar suhbat ichida ketma-ket chiqadi.
 * Sevinchoy ko'rinishni components/ui va styles orqali o'zgartiradi.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatAction, Conversation, SimSession } from "@lex/contracts";
import { api } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { texts } from "@/content/texts.uz";
import { Button } from "@/components/ui/Button";
import { CardView } from "./_parts/ChatCards";

const STORAGE_KEY = "lex.conversation";
const POLL_MS = 3000;

function rememberConversation(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the conversation still works for this page view.
  }
}

export default function ChatPage() {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [session, setSession] = useState<SimSession | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const startNew = useCallback(async () => {
    const c = await api.conversation.start();
    rememberConversation(c.id);
    window.history.replaceState(null, "", `/?c=${c.id}`);
    setConv(c);
  }, []);

  useEffect(() => {
    setSession(loadSession());
    const params = new URLSearchParams(window.location.search);
    let id = params.get("c");
    if (!id) {
      try {
        id = localStorage.getItem(STORAGE_KEY);
      } catch {
        id = null;
      }
    }
    const prefill = params.get("text"); // from the Telegram bot
    if (prefill) setText(prefill);
    (id ? api.conversation.get(id).catch(() => null) : Promise.resolve(null))
      .then((c) => (c ? (rememberConversation(c.id), setConv(c)) : startNew()))
      .catch(() => setFailed(true));
  }, [startNew]);

  // TRACKING: status changes arrive as new Lexi messages.
  useEffect(() => {
    if (!conv) return;
    const t = setInterval(() => {
      api.conversation
        .get(conv.id)
        .then((c) => setConv((prev) => (prev && c.messages.length !== prev.messages.length ? c : prev)))
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [conv?.id]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [conv?.messages.length]);

  async function run(fn: () => Promise<Conversation>) {
    setBusy(true);
    setFailed(false);
    try {
      setConv(await fn());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const send = (value: string) => {
    if (!conv || !value.trim()) return;
    setText("");
    void run(() => api.conversation.say(conv.id, value.trim()));
  };

  const onAction = (a: ChatAction) => {
    if (!conv) return;
    if (a.kind === "reply") send(a.value);
    else if (a.kind === "action") void run(() => api.conversation.act(conv.id, a.value));
  };

  const refresh = () => conv && void run(() => api.conversation.get(conv.id));

  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100vh", paddingBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>{texts.appName}</h1>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>{texts.tagline}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="tel:102"><Button tone="danger">{texts.emergency}</Button></a>
          <Button tone="plain" onClick={() => void startNew()}>{texts.chat.newChat}</Button>
        </div>
      </div>
      <p style={{ marginTop: 0, fontSize: 14 }}>
        {session ? (
          <>
            {texts.application.loggedInAs} <b>{session.citizen.fio}</b>
          </>
        ) : (
          <a href={conv ? `/kirish?c=${conv.id}` : "/kirish"}>{texts.oneid.login}</a>
        )}
      </p>

      <section style={{ flex: 1 }}>
        {conv?.messages.map((m) => {
          const mine = m.role === "user";
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", margin: "10px 0" }}>
              <div style={{ maxWidth: "92%" }}>
                <div
                  style={{
                    background: mine ? "var(--ink)" : "var(--surface)",
                    color: mine ? "#fff" : "var(--ink)",
                    border: mine ? "none" : "1px solid var(--border)",
                    borderRadius: 14,
                    padding: "10px 14px",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {!mine && <b style={{ display: "block", fontSize: 13, color: "var(--muted)" }}>{texts.chat.lexi}</b>}
                  {m.text}
                </div>
                {m.card && <CardView card={m.card} onRefresh={refresh} />}
                {m.actions.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {m.actions.map((a) =>
                      a.kind === "tel" ? (
                        <a key={a.value + a.label} href={`tel:${a.value.replace(/[^\d+]/g, "")}`}>
                          <Button tone="danger">{a.label}</Button>
                        </a>
                      ) : a.kind === "link" ? (
                        <a key={a.value + a.label} href={a.value} target="_blank" rel="noreferrer">
                          <Button tone="plain">{a.label}</Button>
                        </a>
                      ) : (
                        <Button key={a.value + a.label} tone="plain" disabled={busy} onClick={() => onAction(a)}>
                          {a.label}
                        </Button>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {busy && <p style={{ color: "var(--muted)" }}>{texts.chat.thinking}</p>}
        {failed && <p style={{ color: "var(--red)", fontWeight: 600 }}>⚠ {texts.application.retry}</p>}
        <div ref={bottom} />
      </section>

      <div style={{ position: "sticky", bottom: 0, background: "var(--bg)", padding: "10px 0 6px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder={texts.chat.placeholder}
            rows={2}
            style={{ flex: 1, fontSize: 17, padding: 10, borderRadius: 10, border: "1px solid var(--border)" }}
          />
          <Button onClick={() => send(text)} disabled={busy || !conv}>{texts.chat.send}</Button>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 12, margin: "6px 0 0", textAlign: "center" }}>{texts.chat.footer}</p>
      </div>
    </main>
  );
}

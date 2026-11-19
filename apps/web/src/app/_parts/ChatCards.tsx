"use client";
/**
 * XAYRULLA: Lexi suhbatidagi kartalar — shoshilinch yordam, tushuntirish, yo'l xaritasi,
 * ariza, holat, simulyator chaqiruvi. Telefonlar va idoralar faqat katalogdan keladi.
 */
import { useEffect, useState } from "react";
import type { AgencyContact, AnalysisClaim, Application, ArticleText, ChatCard } from "@lex/contracts";
import { api } from "@/lib/api";
import { isUrl, phoneParts } from "@/lib/view";
import { texts } from "@/content/texts.uz";
import { ApplicationPanel } from "./ApplicationPanel";

const box = { border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginTop: 8, background: "var(--surface)" } as const;

function Agency({ a }: { a: AgencyContact }) {
  return (
    <span>
      <b>{a.name}</b>
      {a.phone &&
        phoneParts(a.phone).map((p) => (
          <span key={p.label}>
            {" · "}
            {p.href ? <a href={p.href}>{p.label}</a> : p.label}
          </span>
        ))}
      {a.link && (
        <>
          {" · "}
          {isUrl(a.link) ? <a href={a.link} target="_blank" rel="noreferrer">{a.link}</a> : a.link}
        </>
      )}
    </span>
  );
}

function Claims({ title, claims, articles }: { title: string; claims: readonly AnalysisClaim[]; articles: readonly ArticleText[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!claims.length) return null;
  const article = articles.find((a) => a.key === open);
  return (
    <>
      <h4 style={{ margin: "8px 0 4px" }}>{title}</h4>
      <ul style={{ margin: 0 }}>
        {claims.map((c, i) => (
          <li key={i}>
            {c.text}{" "}
            {c.citations.map((k) => {
              const a = articles.find((x) => x.key === k);
              return (
                <button
                  key={k}
                  onClick={() => setOpen(open === k ? null : k)}
                  title={texts.chat.openArticle}
                  style={{ fontSize: 12, padding: "0 6px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", marginLeft: 2 }}
                >
                  {a ? `${a.article}-m.` : k}
                </button>
              );
            })}
          </li>
        ))}
      </ul>
      {article && (
        <div style={{ ...box, background: "var(--bg)", fontSize: 14, whiteSpace: "pre-wrap" }}>
          <b>
            {article.document}, {article.article}-modda. {article.title}
          </b>
          <div style={{ margin: "6px 0" }}>{article.text}</div>
          <a href={article.sourceUrl} target="_blank" rel="noreferrer">{texts.chat.lexUz}</a>
        </div>
      )}
    </>
  );
}

function ApplicationCard({ id, onSent }: { id: string; onSent: () => void }) {
  const [app, setApp] = useState<Application | null>(null);
  useEffect(() => {
    api.application(id).then(setApp).catch(() => setApp(null));
  }, [id]);
  if (!app) return null;
  return (
    <ApplicationPanel
      application={app}
      onChange={setApp}
      withLexi={false}
      onSend={async (a) => {
        await api.submit(a.id);
        setApp(await api.application(a.id));
        onSent();
      }}
    />
  );
}

export function CardView({ card, onRefresh }: { card: ChatCard; onRefresh: () => void }) {
  switch (card.type) {
    case "emergency":
      return (
        <div style={{ ...box, borderColor: "var(--red)", borderWidth: 2 }}>
          <b style={{ color: "var(--red)" }}>⚠ {texts.chat.emergencyTitle}</b>
          <ul style={{ margin: "6px 0 0" }}>
            {card.contacts.map((a) => (
              <li key={a.id}>
                <Agency a={a} />
              </li>
            ))}
          </ul>
        </div>
      );
    case "explanation":
      return (
        <div style={box}>
          <Claims title={texts.chat.rights} claims={card.rights} articles={card.articles} />
          <Claims title={texts.chat.obligations} claims={card.obligations} articles={card.articles} />
          <Claims title={texts.chat.deadlines} claims={card.deadlines} articles={card.articles} />
        </div>
      );
    case "roadmap":
      return (
        <div style={box}>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {card.steps.map((s) => (
              <li key={s.order} style={{ marginBottom: 6 }}>
                {s.agency && s.title === s.agency.name ? <Agency a={s.agency} /> : <span>{s.title}</span>}
                {s.agency && s.title !== s.agency.name && (
                  <div style={{ fontSize: 14 }}>
                    <Agency a={s.agency} />
                  </div>
                )}
                {s.documents.length > 0 && (
                  <div style={{ fontSize: 14, color: "var(--muted)" }}>
                    {texts.chat.documents} {s.documents.join(", ")}
                  </div>
                )}
                {s.deadline && (
                  <div style={{ fontSize: 14, color: "var(--muted)" }}>
                    {texts.chat.deadline} {s.deadline}
                  </div>
                )}
              </li>
            ))}
          </ol>
          {card.notYet.length > 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--muted)" }}>
              {texts.chat.notYet} {card.notYet.map((a) => a.name).join(", ")}
            </p>
          )}
        </div>
      );
    case "application":
      return <ApplicationCard id={card.applicationId} onSent={onRefresh} />;
    case "status":
      return (
        <div style={box}>
          <b>{texts.chat.statusTitle}:</b> {texts.tracking.status[card.status] ?? card.status} · {card.receiptId} · {card.agencyName}
        </div>
      );
    case "emergency_call":
      return (
        <div style={{ ...box, borderStyle: "dashed", borderColor: "var(--accent)" }}>
          <b>{texts.chat.callSentTitle}</b>
          <div style={{ fontSize: 14 }}>
            {card.call.agencyName}
            {card.call.phone ? ` (${card.call.phone})` : ""} · {texts.chat.callStatus} · {new Date(card.call.createdAt).toLocaleString("uz-UZ")}
          </div>
        </div>
      );
    case "login":
      return (
        <div style={box}>
          <a href={card.url}>{texts.chat.loginLink}</a>
        </div>
      );
  }
}

"use client";
/**
 * XAYRULLA: "Tahlil" va "E'tibor bering (o'zingiz)" bo'limlari. Har bir jumla yonida modda iqtiboslari.
 * Matnni LLM yozadi, lekin faqat berilgan moddalarga tayanadi (iqtibossiz jumlalar olib tashlangan).
 */
import type { AnalysisClaim, LegalAnalysis } from "@lex/contracts";
import { texts } from "@/content/texts.uz";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";

function Claims({ claims, analysis }: { claims: readonly AnalysisClaim[]; analysis: LegalAnalysis }) {
  const label = (key: string) => {
    const a = analysis.articles.find((x) => x.key === key);
    return a ? { text: `${a.article}-modda`, title: `${a.document} — ${a.title}`, href: a.sourceUrl } : { text: key, title: key, href: null };
  };
  return (
    <ul>
      {claims.map((c, i) => (
        <li key={i}>
          {c.text}{" "}
          {c.citations.map((k) => {
            const l = label(k);
            return (
              <sup key={k} style={{ marginLeft: 2 }}>
                [{l.href ? <a href={l.href} target="_blank" rel="noreferrer" title={l.title}>{l.text}</a> : l.text}]
              </sup>
            );
          })}
        </li>
      ))}
    </ul>
  );
}

export function AnalysisPanel({ analysis }: { analysis: LegalAnalysis }) {
  return (
    <>
      <Card>
        <h3 style={{ marginTop: 0 }}>{texts.analysis.title}</h3>
        {analysis.reviewNotice && <Notice title={texts.reviewWarningTitle}>{analysis.reviewNotice}</Notice>}
        <Claims claims={analysis.summary} analysis={analysis} />
        {analysis.rights.length > 0 && (
          <>
            <h4>{texts.analysis.rights}</h4>
            <Claims claims={analysis.rights} analysis={analysis} />
          </>
        )}
        {analysis.deadlines.length > 0 && (
          <>
            <h4>{texts.analysis.deadlines}</h4>
            <Claims claims={analysis.deadlines} analysis={analysis} />
          </>
        )}
        <h4>{texts.analysis.sources}</h4>
        <ul style={{ fontSize: 14 }}>
          {analysis.articles.map((a) => (
            <li key={a.key}>
              <a href={a.sourceUrl} target="_blank" rel="noreferrer">
                {a.document}, {a.article}-modda
              </a>{" "}
              — {a.title} <span style={{ color: "var(--muted)" }}>({a.source === "catalog" ? texts.analysis.fromCatalog : texts.analysis.fromSearch}, {a.status})</span>
            </li>
          ))}
        </ul>
      </Card>
      {analysis.obligations.length > 0 && (
        <Card>
          <h3 style={{ marginTop: 0 }}>{texts.analysis.yourSide}</h3>
          <Claims claims={analysis.obligations} analysis={analysis} />
        </Card>
      )}
    </>
  );
}

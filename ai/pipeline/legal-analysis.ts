/**
 * "Haqiqat ko'zgusi": explanation of the case grounded in the retrieved articles.
 * Every claim must cite a given article key; anything else is removed.
 */
import { z } from "zod";
import type { CitedArticle, LegalAnalysis } from "@lex/contracts";
import type { ChatModelProvider } from "../models/provider";
import { type AgencyOption, legalAnalysisJsonSchema, legalAnalysisMessages } from "../prompts/legal-analysis.prompt";
import type { RetrievedArticle } from "../rag/catalog-retrieval";
import { filterClaimCitations } from "../rag/citation-validator";

/** Article text sent to the model is capped so the prompt stays small. */
const MAX_ARTICLE_CHARS = 2500;

const Claims = z.array(z.object({ text: z.string(), citations: z.array(z.string()) })).default([]);
const RawAnalysis = z.object({
  summary: Claims,
  rights: Claims,
  obligations: Claims,
  deadlines: Claims,
  agencies: z.array(z.string()).default([]),
});

export async function analyzeWithArticles(
  provider: ChatModelProvider,
  story: string,
  articles: readonly RetrievedArticle[],
  reviewNotice: string | null,
  /** Outside the catalog: the model may pick agencies, but only from this catalog list. */
  agencyOptions: readonly AgencyOption[] = [],
): Promise<LegalAnalysis> {
  const reply = await provider.complete(
    legalAnalysisMessages(
      story,
      articles.map((a) => ({ key: a.key, label: `${a.document}, ${a.article}-modda. ${a.title}`, text: a.text.slice(0, MAX_ARTICLE_CHARS) })),
      agencyOptions,
    ),
    { json: true, jsonSchema: legalAnalysisJsonSchema(agencyOptions.map((a) => a.id)), temperature: 0 },
  );
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  const raw = RawAnalysis.parse(JSON.parse(reply.slice(start, end + 1)) as unknown);

  const allowed = new Set(articles.map((a) => a.key));
  let dropped = 0;
  const clean = (claims: z.infer<typeof Claims>, max: number) => {
    const r = filterClaimCitations(claims, allowed);
    dropped += r.dropped;
    return r.claims.slice(0, max);
  };
  const summary = clean(raw.summary, 3);
  const rights = clean(raw.rights, 4);
  const obligations = clean(raw.obligations, 4);
  const deadlines = clean(raw.deadlines, 4);

  const cited = new Set([...summary, ...rights, ...obligations, ...deadlines].flatMap((c) => c.citations));
  const cards: CitedArticle[] = articles
    .filter((a) => cited.has(a.key))
    .map((a) => ({ key: a.key, article: a.article, title: a.title, document: a.document, sourceUrl: a.sourceUrl, status: a.status, source: a.source }));

  const allowedAgencies = new Set(agencyOptions.map((a) => a.id));
  const suggestedAgencyIds = [...new Set(raw.agencies)].filter((id) => allowedAgencies.has(id)).slice(0, 3);
  return {
    summary,
    rights,
    obligations,
    deadlines,
    articles: cards,
    reviewNotice,
    model: provider.id ?? "unknown",
    droppedCitations: dropped,
    suggestedAgencyIds,
  };
}

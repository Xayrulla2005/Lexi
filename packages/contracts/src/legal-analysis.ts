import { z } from "zod";

/** Where an article came from: the catalog of the problem type, or semantic retrieval. */
export const ArticleSource = z.enum(["catalog", "rag"]);
export type ArticleSource = z.infer<typeof ArticleSource>;

/** One sentence of the analysis with the article keys it is based on (at least one). */
export const AnalysisClaim = z.object({
  text: z.string().min(1),
  /** Article keys, e.g. "mehnat_kodeksi/253"; only articles listed in `articles`. */
  citations: z.array(z.string().min(1)).min(1),
});
export type AnalysisClaim = z.infer<typeof AnalysisClaim>;

export const CitedArticle = z.object({
  key: z.string().min(1),
  /** As written in law: "253", "126¹". */
  article: z.string().min(1),
  title: z.string(),
  document: z.string(),
  sourceUrl: z.string(),
  /** DRAFT until a lawyer verifies the text. */
  status: z.string(),
  source: ArticleSource,
});
export type CitedArticle = z.infer<typeof CitedArticle>;

/**
 * "Haqiqat ko'zgusi": an LLM explanation grounded only in the given articles.
 * Claims citing articles that were not given are removed by the citation validator.
 */
export const LegalAnalysis = z.object({
  summary: z.array(AnalysisClaim),
  rights: z.array(AnalysisClaim),
  /** The user's own obligations and possible mistakes (neutral wording). */
  obligations: z.array(AnalysisClaim),
  /** Only deadlines stated in a given article. */
  deadlines: z.array(AnalysisClaim),
  articles: z.array(CitedArticle),
  /** Copied from the routing decision: the route/laws are not yet reviewed by a lawyer. */
  reviewNotice: z.string().nullable(),
  /** "<backend>:<model>" that wrote the analysis. */
  model: z.string(),
  /** Citations removed because they pointed to articles that were not given. */
  droppedCitations: z.number().int().nonnegative(),
  /** Situations outside the catalog: agency ids the model picked from the catalog list (validated). */
  suggestedAgencyIds: z.array(z.string()).default([]),
});
export type LegalAnalysis = z.infer<typeof LegalAnalysis>;

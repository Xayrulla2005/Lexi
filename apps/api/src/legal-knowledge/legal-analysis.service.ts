import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { analyzeWithArticles, defaultChatProvider, getArticlesForProblem, retrieveForAnalysis, type ProviderChoice, type RetrievedArticle } from "@lex/ai";
import { ARTICLE_RETRIEVER, type ArticleRetriever, LLM_CHAT } from "../llm/llm.module";
import type { LegalAnalysis, RoutingDecision } from "@lex/contracts";

/**
 * "Haqiqat ko'zgusi" for a case: catalog articles (+ RAG extras) -> LLM explanation with
 * citations; citations to articles that were not given are removed. Returns null without
 * an LLM, for emergencies (safety first, no reading), for the fallback route (no catalog
 * articles), or when anything fails.
 * The story is never logged.
 */
@Injectable()
export class LegalAnalysisService {
  private readonly logger = new Logger(LegalAnalysisService.name);

  constructor(
    @Optional() @Inject(LLM_CHAT) private readonly chatChoice: ProviderChoice | null = null,
    @Optional() @Inject(ARTICLE_RETRIEVER) private readonly retriever: ArticleRetriever | null = null,
  ) {}

  async analyze(story: string, decision: RoutingDecision): Promise<LegalAnalysis | null> {
    const chat = this.chatChoice ?? defaultChatProvider();
    // Only catalog-anchored cases: with problemId null, RAG-only articles proved misleading
    // (an extortion story got bribery articles). The fallback route sends the user to a lawyer instead.
    if (!chat.provider || decision.routeType !== "RULE_BASED" || !decision.problemId) return null;
    const t0 = performance.now();
    let articles: RetrievedArticle[];
    try {
      articles = await (this.retriever ?? retrieveForAnalysis)(story, decision.problemId);
    } catch (e) {
      // RAG model unavailable: the catalog articles alone are still exact.
      this.logger.warn(`[analysis] retrieval failed (${(e as Error).name}); using catalog articles only`);
      articles = decision.problemId ? getArticlesForProblem(decision.problemId) : [];
    }
    if (!articles.length) return null;
    try {
      const result = await analyzeWithArticles(chat.provider, story, articles, decision.reviewNotice);
      this.logger.log(
        `[analysis] ${result.model}: ${articles.length} articles, ${result.droppedCitations} citations dropped, ${Math.round(performance.now() - t0)} ms`,
      );
      return result;
    } catch (e) {
      this.logger.warn(`[analysis] LLM failed: ${(e as Error).message.slice(0, 120)}`);
      return null;
    }
  }
}

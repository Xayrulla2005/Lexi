import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { retrieveForAnalysis, warmUp, type RetrievedArticle } from "@lex/ai";

export interface RetrievalResult {
  articles: RetrievedArticle[];
  /** Server-side time for this request (ms). */
  tookMs: number;
}

/**
 * Article retrieval for analysis (catalog first, RAG extras). The bge-m3 model and the
 * saved index are loaded once per process: warm-up starts in the background when the
 * API boots, and early requests simply wait for the same load.
 *
 * Warm-up is skipped under Jest and when RAG_WARMUP=0 (the model takes ~15–170 s to load).
 */
@Injectable()
export class LegalRetrievalService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegalRetrievalService.name);
  private warming: Promise<void> | null = null;

  onApplicationBootstrap(): void {
    if (process.env.RAG_WARMUP === "0" || process.env.NODE_ENV === "test") return;
    this.warming = warmUp()
      .then(({ loadMs, firstQueryMs }) => this.logger.log(`[rag] warm-up: model+index ${loadMs} ms, first query ${firstQueryMs} ms`))
      .catch((e: unknown) => this.logger.warn(`[rag] warm-up failed: ${(e as Error).message}`));
  }

  /** Resolves when the warm-up has finished (or immediately when it was skipped). */
  ready(): Promise<void> {
    return this.warming ?? Promise.resolve();
  }

  async retrieve(story: string, problemId: string | null): Promise<RetrievalResult> {
    const t0 = performance.now();
    const articles = await retrieveForAnalysis(story, problemId);
    const tookMs = Math.round(performance.now() - t0);
    this.logger.log(`[rag] retrieve problemId=${problemId ?? "null"}: ${articles.length} articles in ${tookMs} ms`);
    return { articles, tookMs };
  }
}

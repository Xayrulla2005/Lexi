import { Global, Module } from "@nestjs/common";
import { defaultChatProvider, retrieveForAnalysis, type ProviderChoice, type RetrievedArticle } from "@lex/ai";

/** The chat model choice (LLM_PROVIDER). Tests override it with a mock. */
export const LLM_CHAT = Symbol("LLM_CHAT");
/** Article retrieval for explanations (catalog + RAG). Tests override it (no embedding model). */
export const ARTICLE_RETRIEVER = Symbol("ARTICLE_RETRIEVER");

export type ArticleRetriever = (story: string, problemId: string | null) => Promise<RetrievedArticle[]>;

/** Global so every module gets the same (overridable) LLM and retriever. */
@Global()
@Module({
  providers: [
    { provide: LLM_CHAT, useFactory: (): ProviderChoice => defaultChatProvider() },
    { provide: ARTICLE_RETRIEVER, useValue: retrieveForAnalysis as ArticleRetriever },
  ],
  exports: [LLM_CHAT, ARTICLE_RETRIEVER],
})
export class LlmModule {}

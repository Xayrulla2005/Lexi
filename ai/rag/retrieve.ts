import type { LegalSourceDocument } from "@lex/contracts";
import type { DocumentRetriever, RetrievalQuery, RetrievedSource } from "./interfaces";

/**
 * In-memory retriever over an explicit list of documents.
 *
 * Placeholder: ranks by naive keyword overlap. It will be replaced by
 * EmbeddingProvider + VectorStore + Reranker once legal-knowledge/ contains
 * reviewed documents. With an empty corpus it returns no sources, so the
 * pipeline cannot cite anything — by design.
 */
export class InMemoryRetriever implements DocumentRetriever {
  constructor(private readonly documents: readonly LegalSourceDocument[] = []) {}

  async retrieve(query: RetrievalQuery): Promise<RetrievedSource[]> {
    const terms = new Set(query.text.toLowerCase().split(/\W+/u).filter((t) => t.length > 3));
    return this.documents
      .filter((d) => d.verificationStatus !== "REJECTED")
      .filter((d) => !query.domain || d.domain === query.domain)
      .map((document) => {
        const words = `${document.documentName} ${document.text}`.toLowerCase().split(/\W+/u);
        const score = words.filter((w) => terms.has(w)).length;
        return { document, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.document.documentId.localeCompare(b.document.documentId))
      .slice(0, query.topK ?? 5);
  }
}

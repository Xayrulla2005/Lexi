/**
 * RAG building blocks. Each step is an interface so implementations
 * (in-memory, pgvector, HF embeddings, cross-encoder reranker) can be swapped
 * without touching the analysis pipeline.
 */
import type { LegalDomain, LegalReference, LegalSourceDocument } from "@lex/contracts";

export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export interface VectorRecord {
  id: string;
  vector: readonly number[];
}

export interface VectorMatch {
  id: string;
  /** Similarity score; higher is more similar. */
  score: number;
}

/** Vector search abstraction (e.g. pgvector, in-memory). */
export interface VectorStore {
  upsert(records: readonly VectorRecord[]): Promise<void>;
  search(query: readonly number[], topK: number): Promise<VectorMatch[]>;
}

export interface RetrievalQuery {
  text: string;
  domain?: LegalDomain;
  topK?: number;
}

export interface RetrievedSource {
  document: LegalSourceDocument;
  score: number;
}

/** Legal document retrieval interface used by the analysis pipeline. */
export interface DocumentRetriever {
  retrieve(query: RetrievalQuery): Promise<RetrievedSource[]>;
}

export interface Reranker {
  rerank(query: string, candidates: readonly RetrievedSource[], topK: number): Promise<RetrievedSource[]>;
}

export interface CitationValidationResult {
  /** References that point to a retrieved source, with metadata copied from that source. */
  accepted: LegalReference[];
  /** References the model produced that do not match any retrieved source. */
  rejected: LegalReference[];
}

/**
 * Guards against invented citations: only references to documents that were
 * actually retrieved may reach the user, and their verification metadata is
 * taken from the source of record, never from the model.
 */
export interface CitationValidator {
  validate(references: readonly LegalReference[], sources: readonly RetrievedSource[]): CitationValidationResult;
}

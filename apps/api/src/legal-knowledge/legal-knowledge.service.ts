import { Injectable } from "@nestjs/common";
import type { LegalSourceDocument } from "@lex/contracts";

/**
 * Registry of legal source documents (legal-knowledge/).
 *
 * Placeholder: holds no documents yet. Planned responsibilities:
 *  - load and validate documents against LegalSourceDocument;
 *  - expose them to the RAG retriever (ai/rag) and to citation validation;
 *  - never serve REJECTED documents.
 */
@Injectable()
export class LegalKnowledgeService {
  private readonly documents: readonly LegalSourceDocument[] = [];

  list(): readonly LegalSourceDocument[] {
    return this.documents;
  }
}

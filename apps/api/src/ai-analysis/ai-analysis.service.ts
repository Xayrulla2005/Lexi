import { Inject, Injectable, Optional } from "@nestjs/common";
import { analyze, defaultChatProvider, type ProviderChoice } from "@lex/ai";
import { AllowlistCitationValidator, InMemoryRetriever } from "@lex/ai";
import { LLM_CHAT } from "../llm/llm.module";
import type { AnalysisResult } from "@lex/contracts";

/**
 * Boundary between the API and @lex/ai. Returns structured, schema-validated
 * analysis only — it never decides routing or submits anything.
 */
@Injectable()
export class AiAnalysisService {
  constructor(@Optional() @Inject(LLM_CHAT) private readonly chat: ProviderChoice | null = null) {}

  analyze(text: string): Promise<AnalysisResult> {
    return analyze(
      { text },
      {
        retriever: new InMemoryRetriever(),
        citationValidator: new AllowlistCitationValidator(),
        chat: this.chat ?? defaultChatProvider(),
      },
    );
  }
}

import { Injectable } from "@nestjs/common";
import { analyze } from "@lex/ai";
import type { AnalysisResult } from "@lex/contracts";

/**
 * Boundary between the API and @lex/ai. Returns structured, schema-validated
 * analysis only — it never decides routing or submits anything.
 */
@Injectable()
export class AiAnalysisService {
  analyze(text: string): Promise<AnalysisResult> {
    return analyze({ text });
  }
}

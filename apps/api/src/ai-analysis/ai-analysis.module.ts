import { Module } from "@nestjs/common";
import { AiAnalysisService } from "./ai-analysis.service";

/** Wraps the AI analysis pipeline (@lex/ai). */
@Module({ providers: [AiAnalysisService], exports: [AiAnalysisService] })
export class AiAnalysisModule {}

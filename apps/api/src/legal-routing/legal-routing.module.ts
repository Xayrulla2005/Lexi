import { Module } from "@nestjs/common";
import { LegalRoutingService } from "./legal-routing.service";

/** Deterministic routing decisions (@lex/legal-engine). */
@Module({ providers: [LegalRoutingService], exports: [LegalRoutingService] })
export class LegalRoutingModule {}

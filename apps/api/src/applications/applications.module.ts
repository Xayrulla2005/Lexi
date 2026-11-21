import { Module } from "@nestjs/common";
import { CasesModule } from "../cases/cases.module";
import { SimModule } from "../sim/sim.module";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

/** Applications from catalog templates: fields, consent, PDF. */
@Module({
  imports: [CasesModule, SimModule],
  controllers: [ApplicationsController, DocumentsController],
  providers: [ApplicationsService, DocumentsService],
  exports: [ApplicationsService, DocumentsService],
})
export class ApplicationsModule {}

import { Module } from "@nestjs/common";
import { CasesModule } from "../cases/cases.module";
import { SimModule } from "../sim/sim.module";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";

/** Applications from catalog templates: fields, consent, PDF. */
@Module({
  imports: [CasesModule, SimModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}

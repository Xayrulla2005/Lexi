import { Module } from "@nestjs/common";
import { CasesModule } from "../cases/cases.module";
import { ConsultationsController, ProfessionalsController } from "./marketplace.controller";
import { MarketplaceService } from "./marketplace.service";
import { ProfessionalCabinetController } from "./professional-cabinet.controller";
import { ProfessionalGuard, SimProfessionalSessionsService } from "./sim-professional-sessions";

/** Legal marketplace (MVP): directory, recommendation by case domain, consultation requests. */
@Module({
  imports: [CasesModule],
  controllers: [ProfessionalsController, ConsultationsController, ProfessionalCabinetController],
  providers: [MarketplaceService, SimProfessionalSessionsService, ProfessionalGuard],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}

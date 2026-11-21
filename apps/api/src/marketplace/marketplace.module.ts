import { Module } from "@nestjs/common";
import { CasesModule } from "../cases/cases.module";
import { ConsultationsController, ProfessionalsController } from "./marketplace.controller";
import { MarketplaceService } from "./marketplace.service";

/** Legal marketplace (MVP): directory, recommendation by case domain, consultation requests. */
@Module({
  imports: [CasesModule],
  controllers: [ProfessionalsController, ConsultationsController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}

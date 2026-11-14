import { Module } from "@nestjs/common";
import { CasesController } from "./cases/cases.controller";
import { CasesService } from "./cases/cases.service";
import { RoutingService } from "./routing/routing.service";
import { AppealsController } from "./appeals/appeals.controller";
import { SimulatorController } from "./simulator/simulator.controller";
import { AGENCY_GATEWAY } from "./simulator/agency-gateway";
import { MockAgencyAdapter } from "./simulator/mock-agency.adapter";

@Module({
  controllers: [CasesController, AppealsController, SimulatorController],
  providers: [
    CasesService,
    RoutingService,
    // Haqiqiy integratsiyada faqat shu qator almashadi: useClass: RealAgencyAdapter
    { provide: AGENCY_GATEWAY, useClass: MockAgencyAdapter },
  ],
})
export class AppModule {}

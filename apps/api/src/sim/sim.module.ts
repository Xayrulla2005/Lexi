import { Module } from "@nestjs/common";
import { EriSimulatorService } from "./eri.service";
import { OneIdSimulatorController } from "./oneid.controller";
import { OneIdSimulatorService } from "./oneid.service";

/** SIMULATORS (OneID, e-signature). No real government system is contacted. */
@Module({
  controllers: [OneIdSimulatorController],
  providers: [OneIdSimulatorService, EriSimulatorService],
  exports: [OneIdSimulatorService, EriSimulatorService],
})
export class SimModule {}

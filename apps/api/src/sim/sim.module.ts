import { Module } from "@nestjs/common";
import { OneIdSimulatorController } from "./oneid.controller";
import { OneIdSimulatorService } from "./oneid.service";

/** SIMULATORS (OneID, e-signature). No real government system is contacted. */
@Module({
  controllers: [OneIdSimulatorController],
  providers: [OneIdSimulatorService],
  exports: [OneIdSimulatorService],
})
export class SimModule {}

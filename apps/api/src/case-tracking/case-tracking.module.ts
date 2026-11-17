import { Module } from "@nestjs/common";
import { AgencyGatewayModule } from "../agency-gateway/agency-gateway.module";
import { SimModule } from "../sim/sim.module";
import { CaseTrackingController } from "./case-tracking.controller";

/** Tracks the status of agency submissions. */
@Module({ imports: [AgencyGatewayModule, SimModule], controllers: [CaseTrackingController] })
export class CaseTrackingModule {}

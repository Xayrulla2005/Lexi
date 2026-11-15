import { Module } from "@nestjs/common";
import { AgencyGatewayModule } from "../agency-gateway/agency-gateway.module";
import { CaseTrackingController } from "./case-tracking.controller";

/** Tracks the status of agency submissions. */
@Module({ imports: [AgencyGatewayModule], controllers: [CaseTrackingController] })
export class CaseTrackingModule {}

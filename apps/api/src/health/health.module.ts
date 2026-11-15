import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

/** Liveness endpoint for local checks and deployment probes. */
@Module({ controllers: [HealthController] })
export class HealthModule {}

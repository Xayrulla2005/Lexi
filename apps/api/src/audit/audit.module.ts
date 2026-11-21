import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

/** Application lifecycle audit log, available to every module. */
@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}

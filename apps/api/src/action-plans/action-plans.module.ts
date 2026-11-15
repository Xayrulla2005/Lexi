import { Module } from "@nestjs/common";
import { ActionPlansService } from "./action-plans.service";

/** Action plans and application drafts. */
@Module({ providers: [ActionPlansService], exports: [ActionPlansService] })
export class ActionPlansModule {}

import type { AnalysisResult, CaseChannel, CaseMessage, CaseStatus, RoutingDecision } from "@lex/contracts";
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Persistence model for a Case. Column types are explicit because the dev
 * runner (tsx/esbuild) does not emit decorator metadata.
 * Not used by CasesService yet — see docs "Remaining tasks".
 */
@Entity({ name: "cases" })
export class CaseEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "varchar", length: 128, nullable: true })
  userId!: string | null;

  @Column({ type: "varchar", length: 16 })
  channel!: CaseChannel;

  @Column({ type: "varchar", length: 16 })
  status!: CaseStatus;

  @Column({ type: "jsonb", default: () => "'[]'" })
  messages!: CaseMessage[];

  @Column({ type: "jsonb", nullable: true })
  analysis!: AnalysisResult | null;

  @Column({ type: "jsonb", nullable: true })
  routingDecision!: RoutingDecision | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

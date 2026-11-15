import type { AdapterType, SubmissionStatus } from "@lex/contracts";
import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity({ name: "agency_submissions" })
export class AgencySubmissionEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  caseId!: string;

  @Column({ type: "varchar", length: 64 })
  agencyId!: string;

  @Column({ type: "varchar", length: 16 })
  adapterType!: AdapterType;

  @Column({ type: "varchar", length: 16 })
  status!: SubmissionStatus;

  @Column({ type: "varchar", length: 64 })
  receiptId!: string;

  @Column({ type: "timestamptz" })
  submittedAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  dueAt!: Date | null;
}

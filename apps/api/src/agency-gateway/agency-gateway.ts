import type { AdapterType, AgencySubmission } from "@lex/contracts";

export const AGENCY_GATEWAY = Symbol("AGENCY_GATEWAY");

export interface SubmissionCommand {
  caseId: string;
  agencyId: string;
  documentId?: string;
}

/**
 * Every agency interaction goes through this interface. Only MockAgencyAdapter
 * exists: there is NO official government integration. A real adapter would
 * be a new class with adapterType "OFFICIAL" — nothing else changes.
 */
export interface AgencyGateway {
  readonly adapterType: AdapterType;
  submit(command: SubmissionCommand): Promise<AgencySubmission>;
  getStatus(submissionId: string): Promise<AgencySubmission | undefined>;
  listByAgency(agencyId: string): Promise<AgencySubmission[]>;
}

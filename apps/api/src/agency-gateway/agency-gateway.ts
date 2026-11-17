import type { AdapterType, AgencySubmission, SubmissionPackage } from "@lex/contracts";

export const AGENCY_GATEWAY = Symbol("AGENCY_GATEWAY");

export type StatusListener = (submission: AgencySubmission) => void;

/**
 * Every agency interaction goes through this interface. Only MockAgencyAdapter
 * exists: there is NO official government integration. A RealAgencyAdapter
 * (adapterType "OFFICIAL") would implement the same methods and be swapped in
 * agency-gateway.module.ts — nothing else changes.
 */
export interface AgencyGateway {
  readonly adapterType: AdapterType;
  /** Sends a signed package (ariza.pdf, imzo, ish-malumoti.json, consent, citizen). Status: SUBMITTED. */
  submit(pkg: SubmissionPackage): Promise<AgencySubmission>;
  getStatus(submissionId: string): Promise<AgencySubmission | undefined>;
  /** Submissions addressed to one agency, newest first. */
  listInbox(agencyId: string): Promise<AgencySubmission[]>;
  /** The agency's answer. Status: ANSWERED. */
  respond(submissionId: string, text: string): Promise<AgencySubmission>;
  /** Local bookkeeping: the user escalated this (OVERDUE) submission to another agency. */
  markEscalated(submissionId: string): Promise<AgencySubmission>;
  /** Called on every status change (OVERDUE triggers the escalation draft). */
  onStatusChange(listener: StatusListener): void;
}

import type { AdapterType, AgencySubmission, SubmissionPackage } from "@lex/contracts";

export const AGENCY_GATEWAY = Symbol("AGENCY_GATEWAY");

export type StatusListener = (submission: AgencySubmission) => void;

export interface SubmitOptions {
  /**
   * Stable per application: a retried submit (timeout, crash between the connector call and
   * saving the result) returns the existing submission instead of creating a second one.
   * A real connector must pass it to the agency API (e.g. as its idempotency/reference key).
   */
  idempotencyKey: string;
}

/**
 * Boundary for a future official connector (documentation only — nothing here is configured):
 * per-agency endpoint and credentials kept outside the code (secret manager reference, never
 * in prompts, logs or the repository), OAuth 2.0 client credentials and/or mTLS client
 * certificates, request signing, status webhooks verified by signature, retries with the same
 * idempotency key. No such connector, credential or endpoint exists in this repository.
 */

/**
 * Every agency interaction goes through this interface. Only MockAgencyAdapter
 * exists: there is NO official government integration. A RealAgencyAdapter
 * (adapterType "OFFICIAL") would implement the same methods and be swapped in
 * agency-gateway.module.ts — nothing else changes.
 */
export interface AgencyGateway {
  /** "NONE" = DisabledAgencyGateway (SIM_MODE off, no official connector). */
  readonly adapterType: AdapterType | "NONE";
  /** Sends a signed package (ariza.pdf, imzo, ish-malumoti.json, consent, citizen). Status: SUBMITTED. */
  submit(pkg: SubmissionPackage, options: SubmitOptions): Promise<AgencySubmission>;
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

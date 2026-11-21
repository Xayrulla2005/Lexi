import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { AgencySubmission } from "@lex/contracts";
import type { AgencyGateway } from "./agency-gateway";

/**
 * Used when SIM_MODE is off. There is no official government connector, so nothing can be
 * submitted: every submission is refused (503) instead of silently going to a simulator.
 */
export class DisabledAgencyGateway implements AgencyGateway {
  readonly adapterType = "NONE" as const;

  submit(): Promise<AgencySubmission> {
    return Promise.reject(new ServiceUnavailableException("No agency connector is configured (no official integration; simulator is off)"));
  }
  getStatus(): Promise<AgencySubmission | undefined> {
    return Promise.resolve(undefined);
  }
  listInbox(): Promise<AgencySubmission[]> {
    return Promise.resolve([]);
  }
  respond(): Promise<AgencySubmission> {
    return Promise.reject(new NotFoundException("Submission not found"));
  }
  markEscalated(): Promise<AgencySubmission> {
    return Promise.reject(new NotFoundException("Submission not found"));
  }
  onStatusChange(): void {
    // No connector: no status changes.
  }
}

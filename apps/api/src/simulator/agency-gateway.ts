import type { AppealStatus } from "@lex/contracts";

export const AGENCY_GATEWAY = Symbol("AGENCY_GATEWAY");

export interface AppealDto {
  case_id: string;
  agency_id: string;
  document_id: string;
  text?: string;
}

export interface AppealRecord {
  id: string;
  external_id: string;
  agency_id: string;
  case_id: string;
  status: AppealStatus;
  submitted_at: string;
  due_at: string;
}

/** Har bir idora bilan aloqa shu interfeys orqali. Haqiqiy API kelganda yangi adapter yoziladi. */
export interface AgencyGateway {
  submit(appeal: AppealDto): Promise<AppealRecord>;
  getStatus(id: string): Promise<AppealRecord | undefined>;
  listByAgency(agencyId: string): Promise<AppealRecord[]>;
}

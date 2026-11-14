import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AgencyGateway, AppealDto, AppealRecord } from "./agency-gateway";

const PREFIX: Record<string, string> = {
  mehnat_inspeksiyasi: "MI",
  profilaktika_inspektori: "PI",
  virtual_qabulxona: "VQ",
  mib: "MIB",
  iiv_102: "IIV",
};

/**
 * SIMULYATOR: haqiqiy idora o'rniga. Holat taymer bo'yicha o'zgaradi.
 * DEMO_SPEED = 1 "kun" necha millisekund (demoda 1000).
 * TODO(Xayrulla): setTimeout o'rniga BullMQ kechiktirilgan vazifalar; holat o'zgarsa bot/vebga xabar.
 */
@Injectable()
export class MockAgencyAdapter implements AgencyGateway {
  private readonly appeals = new Map<string, AppealRecord>();
  private counter = 450;
  private readonly day = Number(process.env.DEMO_SPEED ?? 86_400_000);

  async submit(dto: AppealDto): Promise<AppealRecord> {
    const now = Date.now();
    const rec: AppealRecord = {
      id: randomUUID(),
      external_id: `${PREFIX[dto.agency_id] ?? "XX"}-2026-${String(++this.counter).padStart(5, "0")}`,
      agency_id: dto.agency_id,
      case_id: dto.case_id,
      status: "received",
      submitted_at: new Date(now).toISOString(),
      due_at: new Date(now + 15 * this.day).toISOString(),
    };
    this.appeals.set(rec.id, rec);

    setTimeout(() => this.setStatus(rec.id, "in_review"), 2 * this.day);
    setTimeout(() => this.setStatus(rec.id, "answered"), 10 * this.day);
    return rec;
  }

  async getStatus(id: string) {
    return this.appeals.get(id);
  }

  async listByAgency(agencyId: string) {
    return [...this.appeals.values()].filter((a) => a.agency_id === agencyId);
  }

  private setStatus(id: string, status: AppealRecord["status"]) {
    const a = this.appeals.get(id);
    if (a) a.status = status;
  }
}

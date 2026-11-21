import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  ConsultationRequest,
  LegalProfessional,
  type AssignedConsultation,
  type ConsultationStatus,
  type CreateConsultationRequest,
  type LegalDomain,
  type ProfessionalVerification,
} from "@lex/contracts";
import { AuditService } from "../audit/audit.service";
import { simModeEnabled } from "../auth/sim-mode";
import { CasesService } from "../cases/cases.service";
import { JsonStore } from "../common/json-store";
import { runtimeFile, simDataDir } from "../common/paths";

/** A simulated (fictional) profile can never be VERIFIED: the directory refuses to load otherwise. */
const DirectoryFile = z.object({
  $comment: z.string().optional(),
  professionals: z.array(
    LegalProfessional.refine((p) => !(p.simulated && p.verificationStatus === "VERIFIED"), { message: "simulated profile marked VERIFIED" }),
  ),
});

/** Allowed consultation transitions: target -> statuses it may come from, and who may do it. */
const TRANSITIONS: Readonly<Record<Exclude<ConsultationStatus, "REQUESTED">, { from: readonly ConsultationStatus[]; by: "citizen" | "professional" }>> = {
  ACCEPTED: { from: ["REQUESTED"], by: "professional" },
  DECLINED: { from: ["REQUESTED"], by: "professional" },
  COMPLETED: { from: ["ACCEPTED"], by: "professional" },
  CANCELLED: { from: ["REQUESTED", "ACCEPTED"], by: "citizen" },
};

const assignedView = ({ citizenId: _citizen, ...rest }: ConsultationRequest): AssignedConsultation => rest;

const VERIFICATION_ORDER: Readonly<Record<ProfessionalVerification, number>> = { VERIFIED: 0, PENDING: 1, UNVERIFIED: 2, REJECTED: 3 };

/**
 * Legal marketplace (MVP).
 * - Directory: the fictional demo directory (data/sim/professionals.json) in SIM_MODE only;
 *   outside SIM_MODE it is empty (there is no verified real directory yet). Verification status
 *   is shown as stored and never raised automatically; REJECTED/INACTIVE profiles are not listed.
 * - Consultations: created by an authenticated citizen with explicit consent; only the owner
 *   reads or cancels them. Status changes follow TRANSITIONS and are audited.
 */
@Injectable()
export class MarketplaceService {
  private readonly directory: readonly LegalProfessional[];
  private readonly consultations = new JsonStore<ConsultationRequest>(runtimeFile("consultations.json"), ConsultationRequest);

  constructor(
    @Inject(CasesService) private readonly cases: CasesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {
    const raw: unknown = JSON.parse(readFileSync(join(simDataDir(), "professionals.json"), "utf8"));
    this.directory = DirectoryFile.parse(raw).professionals;
  }

  private listed(): readonly LegalProfessional[] {
    if (!simModeEnabled()) return [];
    return this.directory.filter((p) => p.profileStatus === "ACTIVE" && p.verificationStatus !== "REJECTED");
  }

  /** Filter by domain and region; verified first, then by name. */
  search(domain?: LegalDomain, region?: string): LegalProfessional[] {
    const r = region?.toLocaleLowerCase("uz");
    return this.listed()
      .filter((p) => (!domain || p.specializations.includes(domain)) && (!r || p.region.toLocaleLowerCase("uz").includes(r)))
      .sort((a, b) => VERIFICATION_ORDER[a.verificationStatus] - VERIFICATION_ORDER[b.verificationStatus] || a.fullName.localeCompare(b.fullName));
  }

  /** Recommendation for the citizen's own case: professionals of the case's classified domain. */
  recommendForCase(caseId: string, citizenId: string, region?: string): LegalProfessional[] {
    const c = this.cases.owned(caseId, citizenId);
    const domain = c.analysis?.classification.domain;
    if (!domain) throw new BadRequestException("The case has not been analyzed yet");
    return this.search(domain, region);
  }

  profile(id: string): LegalProfessional {
    const p = this.listed().find((x) => x.id === id);
    if (!p) throw new NotFoundException("Professional not found");
    return p;
  }

  async request(citizenId: string, body: CreateConsultationRequest): Promise<ConsultationRequest> {
    this.profile(body.professionalId); // must be listed (active, not rejected)
    const caseId = body.caseId ?? null;
    if (caseId) this.cases.owned(caseId, citizenId); // only the citizen's own case may be linked
    const now = new Date().toISOString();
    const c: ConsultationRequest = {
      id: randomUUID(),
      citizenId,
      professionalId: body.professionalId,
      caseId,
      message: body.message,
      status: "REQUESTED",
      history: [{ status: "REQUESTED", at: now, by: "citizen" }],
      createdAt: now,
      updatedAt: now,
    };
    this.consultations.set(c.id, c);
    this.audit.record({
      type: "CONSULTATION_REQUESTED",
      actor: { type: "citizen", id: citizenId },
      caseId,
      // No message text in the audit log.
      data: { consultationId: c.id, professionalId: c.professionalId },
    });
    await Promise.all([this.consultations.persist("consultation.request"), this.audit.persist("consultation.request")]);
    return c;
  }

  mine(citizenId: string): ConsultationRequest[] {
    return this.consultations
      .values()
      .filter((c) => c.citizenId === citizenId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  owned(id: string, citizenId: string): ConsultationRequest {
    const c = this.consultations.get(id);
    if (!c) throw new NotFoundException("Consultation not found");
    if (c.citizenId !== citizenId) throw new ForbiddenException("Consultation belongs to another citizen");
    return c;
  }

  /** Consultations assigned to this professional, newest first (without the citizen's identity). */
  assignedTo(professionalId: string): AssignedConsultation[] {
    return this.consultations
      .values()
      .filter((c) => c.professionalId === professionalId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(assignedView);
  }

  /** One consultation for its assigned professional: 404 unknown, 403 another professional's. */
  assigned(id: string, professionalId: string): AssignedConsultation {
    const c = this.consultations.get(id);
    if (!c) throw new NotFoundException("Consultation not found");
    if (c.professionalId !== professionalId) throw new ForbiddenException("Another professional's consultation");
    return assignedView(c);
  }

  /**
   * Status change by the citizen (cancel) or the professional (accept/decline/complete).
   * The professional side has no authenticated HTTP route yet (no professional accounts):
   * it is used by tests and a future professional cabinet.
   */
  async transition(id: string, to: Exclude<ConsultationStatus, "REQUESTED">, actor: { by: "citizen"; citizenId: string } | { by: "professional"; professionalId: string }): Promise<ConsultationRequest> {
    const c = this.consultations.get(id);
    if (!c) throw new NotFoundException("Consultation not found");
    const rule = TRANSITIONS[to];
    if (actor.by !== rule.by) throw new ForbiddenException(`Only the ${rule.by} can set ${to}`);
    if (actor.by === "citizen" && c.citizenId !== actor.citizenId) throw new ForbiddenException("Consultation belongs to another citizen");
    if (actor.by === "professional" && c.professionalId !== actor.professionalId) throw new ForbiddenException("Another professional's consultation");
    if (!rule.from.includes(c.status)) throw new ConflictException(`Cannot go from ${c.status} to ${to}`);
    const at = new Date().toISOString();
    const next: ConsultationRequest = { ...c, status: to, history: [...c.history, { status: to, at, by: actor.by }], updatedAt: at };
    this.consultations.set(id, next);
    this.audit.record({
      type: "CONSULTATION_STATUS_CHANGED",
      actor: actor.by === "citizen" ? { type: "citizen", id: actor.citizenId } : { type: "professional", id: actor.professionalId },
      caseId: c.caseId,
      data: { consultationId: id, from: c.status, to, by: actor.by },
    });
    await Promise.all([this.consultations.persist("consultation.status"), this.audit.persist("consultation.status")]);
    return next;
  }
}

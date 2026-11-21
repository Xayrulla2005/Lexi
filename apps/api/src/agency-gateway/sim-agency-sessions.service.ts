import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SIM_AGENCY_SESSION_HEADER, type SimAgencySession } from "@lex/contracts";
import { headerValue, type RequestHeaders } from "../auth/auth-provider";
import { simModeEnabled } from "../auth/sim-mode";
import { JsonStore } from "../common/json-store";
import { runtimeFile } from "../common/paths";
import { hashSecret, newSecret } from "../common/secrets";
import { LegalRoutingService } from "../legal-routing/legal-routing.service";

/** A demo officer's cabinet session lasts one working day. */
export const AGENCY_SESSION_TTL_MS = 8 * 3600 * 1000;

const StoredAgencySession = z.object({
  agencyId: z.string(),
  agencyName: z.string(),
  expiresAt: z.string().datetime({ offset: true }),
});
type StoredAgencySession = z.infer<typeof StoredAgencySession>;

export interface AgencyOfficer {
  agencyId: string;
  agencyName: string;
}

const sameSecret = (a: string, b: string): boolean => {
  const x = Buffer.from(hashSecret(a), "hex");
  const y = Buffer.from(hashSecret(b), "hex");
  return timingSafeEqual(x, y);
};

/**
 * SIMULATOR — sessions of demo agency officers for the cabinet (/idora). One session = one
 * agency: it sees and acts on that agency's submissions and calls only. Citizen sessions are
 * not accepted. Tokens are stored as SHA-256 hashes. With SIM_AGENCY_PASSCODE set, login needs it.
 */
@Injectable()
export class SimAgencySessionsService {
  private readonly sessions = new JsonStore<StoredAgencySession>(runtimeFile("agency-sessions.json"), StoredAgencySession);

  constructor(@Inject(LegalRoutingService) private readonly routing: LegalRoutingService) {}

  async login(agencyId: string, passcode: string | undefined): Promise<SimAgencySession> {
    const required = process.env.SIM_AGENCY_PASSCODE;
    if (required && !(passcode && sameSecret(passcode, required))) throw new UnauthorizedException("Wrong passcode");
    const agency = this.routing.agencies().find((a) => a.id === agencyId);
    if (!agency) throw new UnauthorizedException("Unknown agency");
    const token = newSecret();
    const expiresAt = new Date(Date.now() + AGENCY_SESSION_TTL_MS).toISOString();
    this.sessions.set(hashSecret(token), { agencyId: agency.id, agencyName: agency.name, expiresAt });
    await this.sessions.persist("agency.login");
    return { token, agencyId: agency.id, agencyName: agency.name, expiresAt, simulated: true };
  }

  find(token: string | undefined): AgencyOfficer | null {
    if (!token || !simModeEnabled()) return null;
    const s = this.sessions.get(hashSecret(token));
    if (!s || Date.parse(s.expiresAt) <= Date.now()) return null;
    return { agencyId: s.agencyId, agencyName: s.agencyName };
  }
}

interface OfficerRequest {
  headers: RequestHeaders;
  agencyOfficer?: AgencyOfficer;
}

/** Cabinet routes: a valid agency-officer session is required (401 otherwise). */
@Injectable()
export class AgencyOfficerGuard implements CanActivate {
  constructor(@Inject(SimAgencySessionsService) private readonly sessions: SimAgencySessionsService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<OfficerRequest>();
    const officer = this.sessions.find(headerValue(req.headers, SIM_AGENCY_SESSION_HEADER));
    if (!officer) throw new UnauthorizedException("Agency cabinet session required");
    req.agencyOfficer = officer;
    return true;
  }
}

export const CurrentOfficer = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AgencyOfficer => ctx.switchToHttp().getRequest<OfficerRequest>().agencyOfficer as AgencyOfficer,
);

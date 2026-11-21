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
import { SIM_PROFESSIONAL_SESSION_HEADER, type SimProfessionalSession } from "@lex/contracts";
import { headerValue, type RequestHeaders } from "../auth/auth-provider";
import { simModeEnabled } from "../auth/sim-mode";
import { JsonStore } from "../common/json-store";
import { runtimeFile } from "../common/paths";
import { hashSecret, newSecret } from "../common/secrets";
import { MarketplaceService } from "./marketplace.service";

export const PROFESSIONAL_SESSION_TTL_MS = 8 * 3600 * 1000;

const Stored = z.object({ professionalId: z.string(), expiresAt: z.string().datetime({ offset: true }), revokedAt: z.string().nullable().default(null) });
type Stored = z.infer<typeof Stored>;

export interface ProfessionalPrincipal {
  professionalId: string;
}

const same = (a: string, b: string) => timingSafeEqual(Buffer.from(hashSecret(a), "hex"), Buffer.from(hashSecret(b), "hex"));

/**
 * SIMULATOR — sessions of the fictional demo professionals (lawyer cabinet /yurist).
 * There are no real lawyer accounts: this works only with SIM_MODE=true, for listed
 * (active, not rejected) demo profiles. With SIM_PROFESSIONAL_PASSCODE set, login needs it.
 * Tokens: 256-bit, stored as SHA-256, 8 h. A citizen or agency token is never accepted here.
 */
@Injectable()
export class SimProfessionalSessionsService {
  private readonly sessions = new JsonStore<Stored>(runtimeFile("professional-sessions.json"), Stored);

  constructor(@Inject(MarketplaceService) private readonly market: MarketplaceService) {}

  async login(professionalId: string, passcode: string | undefined): Promise<SimProfessionalSession> {
    const required = process.env.SIM_PROFESSIONAL_PASSCODE;
    if (required && !(passcode && same(passcode, required))) throw new UnauthorizedException("Wrong passcode");
    let name: string;
    try {
      name = this.market.profile(professionalId).fullName;
    } catch {
      throw new UnauthorizedException("Unknown professional");
    }
    const token = newSecret();
    const expiresAt = new Date(Date.now() + PROFESSIONAL_SESSION_TTL_MS).toISOString();
    this.sessions.set(hashSecret(token), { professionalId, expiresAt, revokedAt: null });
    await this.sessions.persist("professional.login");
    return { token, professionalId, fullName: name, expiresAt, simulated: true };
  }

  find(token: string | undefined): ProfessionalPrincipal | null {
    if (!token || !simModeEnabled()) return null;
    const s = this.sessions.get(hashSecret(token));
    if (!s || s.revokedAt || Date.parse(s.expiresAt) <= Date.now()) return null;
    return { professionalId: s.professionalId };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const key = hashSecret(token);
    const s = this.sessions.get(key);
    if (s && !s.revokedAt) this.sessions.set(key, { ...s, revokedAt: new Date().toISOString() });
    await this.sessions.persist("professional.logout");
  }
}

interface ProRequest {
  headers: RequestHeaders;
  professional?: ProfessionalPrincipal;
}

/** Lawyer-cabinet routes: a valid professional session is required (401 otherwise). */
@Injectable()
export class ProfessionalGuard implements CanActivate {
  constructor(@Inject(SimProfessionalSessionsService) private readonly sessions: SimProfessionalSessionsService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<ProRequest>();
    const p = this.sessions.find(headerValue(req.headers, SIM_PROFESSIONAL_SESSION_HEADER));
    if (!p) throw new UnauthorizedException("Professional session required");
    req.professional = p;
    return true;
  }
}

export const CurrentProfessional = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ProfessionalPrincipal => ctx.switchToHttp().getRequest<ProRequest>().professional as ProfessionalPrincipal,
);

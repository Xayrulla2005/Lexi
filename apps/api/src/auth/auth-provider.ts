import { ForbiddenException } from "@nestjs/common";
import type { SimCitizen } from "@lex/contracts";

export const AUTH_PROVIDER = Symbol("AUTH_PROVIDER");

/** Request headers as Node/Express gives them. */
export type RequestHeaders = Readonly<Record<string, string | string[] | undefined>>;

/** What a provider may look at: headers (incl. Cookie) and the HTTP method (CSRF rules). */
export interface AuthRequest {
  headers: RequestHeaders;
  method?: string;
}

/** Who owns resources: an email account, or (simulator) a OneID test citizen. */
export interface Principal {
  /** Owner id stored on conversations, cases, applications ("acc_…" for accounts). */
  id: string;
  kind: "account" | "oneid-simulator";
  displayName: string;
  email: string | null;
}

/** The authenticated caller, resolved on the server only (never from a body or URL). */
export interface AuthenticatedCitizen {
  principal: Principal;
  /**
   * A OneID identity (SIMULATOR today) for applications: fills the template's personal fields
   * and signs. Null for an email account without a linked OneID session.
   */
  citizen: SimCitizen | null;
  /** Provider id, e.g. "oneid-simulator". */
  provider: string;
  /** true when any part is a simulator identity — never a real, verified person. */
  simulated: boolean;
}

/**
 * Authentication boundary. Implementations:
 * - OneIdSimulatorAuthProvider — SIM_MODE only; principal and OneID identity are the same test citizen;
 * - DenyAllAuthProvider        — nothing configured (deny by default).
 * Email accounts (principal "acc_…" without a OneID identity) plug in here later; owners are
 * already keyed by principal.id and applications by identityId, so no data migration is needed.
 */
export interface AuthProvider {
  readonly id: string;
  readonly simulated: boolean;
  /** null = not authenticated. Never throws for bad input. */
  authenticate(req: AuthRequest): AuthenticatedCitizen | null;
}

export const headerValue = (headers: RequestHeaders, name: string): string | undefined => {
  const v = headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

/** No identity provider configured: every request is anonymous. */
export class DenyAllAuthProvider implements AuthProvider {
  readonly id = "none";
  readonly simulated = false;
  authenticate(): AuthenticatedCitizen | null {
    return null;
  }
}

/** Applications need a OneID identity (simulator today), not just an email account. */
export function requireIdentity(auth: AuthenticatedCitizen): SimCitizen {
  if (!auth.citizen) throw new ForbiddenException("OneID identity required for applications");
  return auth.citizen;
}

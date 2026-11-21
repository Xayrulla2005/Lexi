import type { SimCitizen } from "@lex/contracts";

export const AUTH_PROVIDER = Symbol("AUTH_PROVIDER");

/** Request headers as Node/Express gives them. */
export type RequestHeaders = Readonly<Record<string, string | string[] | undefined>>;

/** The citizen behind a request, resolved on the server only (never from a body or URL). */
export interface AuthenticatedCitizen {
  citizen: SimCitizen;
  /** Provider id, e.g. "oneid-simulator". */
  provider: string;
  /** true for development/simulator identities — never a real, verified person. */
  simulated: boolean;
}

/**
 * Authentication boundary. Implementations:
 * - OneIdSimulatorAuthProvider — SIM_MODE only, fictional test citizens;
 * - DenyAllAuthProvider        — default when nothing is configured (deny by default).
 * A real OneID (OIDC) provider would implement the same interface; it does not exist yet.
 */
export interface AuthProvider {
  readonly id: string;
  readonly simulated: boolean;
  /** null = not authenticated (missing, unknown or expired credentials). Never throws for bad input. */
  authenticate(headers: RequestHeaders): AuthenticatedCitizen | null;
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

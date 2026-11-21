import { createHash, type JsonWebKey } from "node:crypto";
import { hashSecret, newSecret } from "../../common/secrets";
import { OidcError, verifyIdToken } from "./id-token";

/**
 * OIDC (authorization code + PKCE) BOUNDARY for a future OneID integration.
 *
 * Nothing here talks to a real provider: endpoints, client id and keys come only from explicit
 * configuration (ONEID_OIDC_* env, all required, https only), and the token endpoint and JWKS
 * are reached through injected interfaces that are NOT implemented in this repository. Without
 * a complete configuration `loadOidcConfig` returns null and no OIDC route exists.
 * No endpoint, credential or provider behaviour is assumed beyond the OIDC Core standard.
 */
export interface OidcConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  authorizationEndpoint: string;
  scopes: string[];
}

const REQUIRED = ["ONEID_OIDC_ISSUER", "ONEID_OIDC_CLIENT_ID", "ONEID_OIDC_REDIRECT_URI", "ONEID_OIDC_AUTHORIZATION_ENDPOINT"] as const;

export function loadOidcConfig(env: NodeJS.ProcessEnv = process.env): OidcConfig | null {
  const values = REQUIRED.map((k) => (env[k] ?? "").trim());
  if (values.some((v) => !v)) return null;
  const [issuer, clientId, redirectUri, authorizationEndpoint] = values as [string, string, string, string];
  for (const [name, url] of [["issuer", issuer], ["redirect URI", redirectUri], ["authorization endpoint", authorizationEndpoint]] as const) {
    if (!url.startsWith("https://")) throw new Error(`OIDC ${name} must be an https URL`);
  }
  return { issuer, clientId, redirectUri, authorizationEndpoint, scopes: ["openid"] };
}

/** Exchanges the authorization code (with the PKCE verifier) at the provider. Not implemented here. */
export interface OidcTokenClient {
  exchange(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<{ idToken: string }>;
}
/** Current provider signing keys (JWKS). Not implemented here. */
export interface OidcKeySource {
  keys(): Promise<readonly (JsonWebKey & { kid?: string; alg?: string })[]>;
}

/** What is kept after login: the stable subject and issuer, optionally a display name. Nothing else. */
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  displayName: string | null;
}

interface PendingLogin {
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
}

/** PKCE S256 challenge for a verifier (RFC 7636). */
export const pkceChallenge = (verifier: string): string => createHash("sha256").update(verifier, "ascii").digest("base64url");

export const STATE_TTL_MS = 10 * 60 * 1000;

export class OidcLoginService {
  /** sha256(state) -> pending login. Single use: removed on the first callback. */
  private readonly pending = new Map<string, PendingLogin>();

  constructor(
    private readonly config: OidcConfig,
    private readonly tokens: OidcTokenClient,
    private readonly jwks: OidcKeySource,
  ) {}

  /** Starts a login: fresh state, nonce and PKCE verifier; returns the provider URL to redirect to. */
  begin(now = Date.now()): { authorizationUrl: string } {
    const state = newSecret();
    const nonce = newSecret();
    const codeVerifier = newSecret(); // 43 chars, within RFC 7636's 43–128
    this.pending.set(hashSecret(state), { nonce, codeVerifier, expiresAt: now + STATE_TTL_MS });
    const url = new URL(this.config.authorizationEndpoint);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(" "),
      state,
      nonce,
      code_challenge: pkceChallenge(codeVerifier),
      code_challenge_method: "S256",
    }).toString();
    return { authorizationUrl: url.toString() };
  }

  /**
   * Callback: the state must be one we issued, unused and not expired (it is consumed before
   * anything else, so a replay fails); provider errors are refused; the ID token is verified
   * (signature, iss, aud, nonce, exp/iat) before any identity is accepted.
   */
  async callback(params: { state?: string; code?: string; error?: string }, now = Date.now()): Promise<VerifiedIdentity> {
    const key = params.state ? hashSecret(params.state) : null;
    const pending = key ? this.pending.get(key) : undefined;
    if (key) this.pending.delete(key);
    if (!pending || pending.expiresAt <= now) throw new OidcError("invalid_state");
    if (params.error || !params.code) throw new OidcError("provider_error");

    const { idToken } = await this.tokens.exchange({ code: params.code, codeVerifier: pending.codeVerifier, redirectUri: this.config.redirectUri });
    const claims = verifyIdToken(idToken, {
      issuer: this.config.issuer,
      clientId: this.config.clientId,
      nonce: pending.nonce,
      keys: await this.jwks.keys(),
      now,
    });
    const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 200) : null;
    return { issuer: claims.iss, subject: claims.sub, displayName: name };
  }
}

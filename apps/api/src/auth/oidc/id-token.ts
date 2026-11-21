import { createPublicKey, type JsonWebKey, verify } from "node:crypto";

/** Why an OIDC step was rejected (no token contents in it). */
export class OidcError extends Error {
  constructor(
    readonly code:
      | "invalid_state"
      | "provider_error"
      | "malformed_token"
      | "unsupported_alg"
      | "unknown_key"
      | "bad_signature"
      | "invalid_issuer"
      | "invalid_audience"
      | "invalid_nonce"
      | "expired"
      | "not_yet_valid"
      | "missing_subject"
      | "not_configured",
  ) {
    super(`OIDC: ${code}`);
    this.name = "OidcError";
  }
}

/** Signing algorithms accepted for ID tokens. "none" and HMAC (HS*) are never accepted. */
const ALGS = { RS256: { kty: "RSA", hash: "sha256" }, ES256: { kty: "EC", hash: "sha256" } } as const;
type Alg = keyof typeof ALGS;

export interface IdTokenExpectations {
  issuer: string;
  clientId: string;
  nonce: string;
  /** Provider keys (JWKS "keys"). */
  keys: readonly (JsonWebKey & { kid?: string; alg?: string })[];
  now?: number;
  /** Allowed clock difference in seconds. */
  skewSeconds?: number;
}

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  azp?: string;
  [claim: string]: unknown;
}

const b64json = (part: string): Record<string, unknown> => {
  const v: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new OidcError("malformed_token");
  return v as Record<string, unknown>;
};

/**
 * Verifies an OIDC ID token (compact JWS) without third-party libraries:
 * algorithm allow-list (RS256, ES256), key by `kid`, signature, then `iss` (exact), `aud`
 * (contains the client id; `azp` must be the client when there are several audiences),
 * `nonce` (exact), `exp` / `iat` / `nbf` with a small skew, and a non-empty `sub`.
 */
export function verifyIdToken(token: string, expect: IdTokenExpectations): IdTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) throw new OidcError("malformed_token");
  const [h, p, s] = parts as [string, string, string];
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = b64json(h);
    claims = b64json(p);
  } catch {
    throw new OidcError("malformed_token");
  }

  const alg = header.alg;
  if (typeof alg !== "string" || !(alg in ALGS)) throw new OidcError("unsupported_alg");
  const spec = ALGS[alg as Alg];
  const key = expect.keys.find((k) => k.kty === spec.kty && (header.kid === undefined || k.kid === header.kid) && (!k.alg || k.alg === alg));
  if (!key) throw new OidcError("unknown_key");

  let ok = false;
  try {
    const publicKey = createPublicKey({ key, format: "jwk" });
    ok = verify(spec.hash, Buffer.from(`${h}.${p}`), alg === "ES256" ? { key: publicKey, dsaEncoding: "ieee-p1363" } : publicKey, Buffer.from(s, "base64url"));
  } catch {
    ok = false;
  }
  if (!ok) throw new OidcError("bad_signature");

  const now = Math.floor((expect.now ?? Date.now()) / 1000);
  const skew = expect.skewSeconds ?? 60;
  if (claims.iss !== expect.issuer) throw new OidcError("invalid_issuer");
  const aud = claims.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(expect.clientId)) throw new OidcError("invalid_audience");
  if (audiences.length > 1 && claims.azp !== expect.clientId) throw new OidcError("invalid_audience");
  if (typeof claims.nonce !== "string" || claims.nonce !== expect.nonce) throw new OidcError("invalid_nonce");
  if (typeof claims.exp !== "number" || claims.exp + skew <= now) throw new OidcError("expired");
  if (typeof claims.iat !== "number" || claims.iat - skew > now) throw new OidcError("not_yet_valid");
  if (typeof claims.nbf === "number" && claims.nbf - skew > now) throw new OidcError("not_yet_valid");
  if (typeof claims.sub !== "string" || !claims.sub.trim()) throw new OidcError("missing_subject");
  return claims as IdTokenClaims;
}

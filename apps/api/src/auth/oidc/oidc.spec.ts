import { createHmac, generateKeyPairSync, type JsonWebKey, sign } from "node:crypto";
import { OidcError, verifyIdToken } from "./id-token";
import { loadOidcConfig, OidcLoginService, pkceChallenge, STATE_TTL_MS, type OidcConfig } from "./oidc-login.service";

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = (k: typeof rsa.publicKey, kid: string): JsonWebKey & { kid: string } => ({ ...(k.export({ format: "jwk" }) as JsonWebKey), kid });
const KEYS = [jwk(rsa.publicKey, "r1"), jwk(ec.publicKey, "e1")];

const ISS = "https://idp.example.test";
const CLIENT = "lexi-client";
const NOW = Date.parse("2026-11-21T10:00:00Z");
const t = Math.floor(NOW / 1000);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function jwt(claims: Record<string, unknown>, opts: { alg?: string; kid?: string; key?: typeof rsa.privateKey } = {}): string {
  const alg = opts.alg ?? "RS256";
  const head = `${b64({ alg, kid: opts.kid ?? (alg === "ES256" ? "e1" : "r1"), typ: "JWT" })}.${b64(claims)}`;
  if (alg === "none") return `${head}.AA`;
  if (alg === "HS256") return `${head}.${createHmac("sha256", "secret").update(head).digest("base64url")}`;
  const key = opts.key ?? (alg === "ES256" ? ec.privateKey : rsa.privateKey);
  const sig = alg === "ES256" ? sign("sha256", Buffer.from(head), { key, dsaEncoding: "ieee-p1363" }) : sign("sha256", Buffer.from(head), key);
  return `${head}.${sig.toString("base64url")}`;
}
const good = { iss: ISS, sub: "subject-1", aud: CLIENT, exp: t + 300, iat: t, nonce: "n1", name: "Test Fuqaro", email: "x@example.test" };
const expect_ = { issuer: ISS, clientId: CLIENT, nonce: "n1", keys: KEYS, now: NOW };
const code = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof OidcError ? e.code : String(e);
  }
};

describe("verifyIdToken", () => {
  it("accepts valid RS256 and ES256 tokens", () => {
    expect(verifyIdToken(jwt(good), expect_).sub).toBe("subject-1");
    expect(verifyIdToken(jwt(good, { alg: "ES256" }), expect_).sub).toBe("subject-1");
  });

  it("rejects alg none, HMAC, unknown keys and bad signatures", () => {
    expect(code(() => verifyIdToken(jwt(good, { alg: "none" }), expect_))).toBe("unsupported_alg");
    expect(code(() => verifyIdToken(jwt(good, { alg: "HS256" }), expect_))).toBe("unsupported_alg");
    expect(code(() => verifyIdToken(jwt(good, { kid: "nope" }), expect_))).toBe("unknown_key");
    expect(code(() => verifyIdToken(jwt(good, { key: other.privateKey }), expect_))).toBe("bad_signature");
    const [h, , s] = jwt(good).split(".");
    expect(code(() => verifyIdToken(`${h}.${b64({ ...good, sub: "admin" })}.${s}`, expect_))).toBe("bad_signature");
    expect(code(() => verifyIdToken("not.a.jwt!", expect_))).toBe("malformed_token");
    expect(code(() => verifyIdToken("abc", expect_))).toBe("malformed_token");
  });

  it("checks issuer, audience, azp, nonce, times and subject", () => {
    expect(code(() => verifyIdToken(jwt({ ...good, iss: "https://evil.test" }), expect_))).toBe("invalid_issuer");
    expect(code(() => verifyIdToken(jwt({ ...good, aud: "other" }), expect_))).toBe("invalid_audience");
    expect(code(() => verifyIdToken(jwt({ ...good, aud: [CLIENT, "other"] }), expect_))).toBe("invalid_audience");
    expect(verifyIdToken(jwt({ ...good, aud: [CLIENT, "other"], azp: CLIENT }), expect_).sub).toBe("subject-1");
    expect(code(() => verifyIdToken(jwt({ ...good, nonce: "n2" }), expect_))).toBe("invalid_nonce");
    expect(code(() => verifyIdToken(jwt({ ...good, nonce: undefined }), expect_))).toBe("invalid_nonce");
    expect(code(() => verifyIdToken(jwt({ ...good, exp: t - 120 }), expect_))).toBe("expired");
    expect(code(() => verifyIdToken(jwt({ ...good, iat: t + 600 }), expect_))).toBe("not_yet_valid");
    expect(code(() => verifyIdToken(jwt({ ...good, sub: " " }), expect_))).toBe("missing_subject");
  });
});

describe("OidcLoginService (boundary, no real provider)", () => {
  const config: OidcConfig = {
    issuer: ISS,
    clientId: CLIENT,
    redirectUri: "https://lexi.example.test/auth/callback",
    authorizationEndpoint: "https://idp.example.test/authorize",
    scopes: ["openid"],
  };
  function setup(idTokenFor: (nonce: string) => string) {
    let verifier = "";
    let nonce = "";
    const svc = new OidcLoginService(
      config,
      {
        exchange: async ({ codeVerifier }) => {
          verifier = codeVerifier;
          return { idToken: idTokenFor(nonce) };
        },
      },
      { keys: async () => KEYS },
    );
    const begin = (now = NOW) => {
      const url = new URL(svc.begin(now).authorizationUrl);
      nonce = url.searchParams.get("nonce") ?? "";
      return url;
    };
    return { svc, begin, verifier: () => verifier };
  }

  it("valid flow: PKCE S256, state and nonce; keeps only issuer, subject and name", async () => {
    const { svc, begin, verifier } = setup((nonce) => jwt({ ...good, nonce }));
    const url = begin();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const id = await svc.callback({ state: url.searchParams.get("state") ?? "", code: "c1" }, NOW);
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge(verifier()));
    expect(id).toEqual({ issuer: ISS, subject: "subject-1", displayName: "Test Fuqaro" }); // no email kept
  });

  it("invalid, replayed or expired state; provider error; wrong nonce", async () => {
    const { svc, begin } = setup((nonce) => jwt({ ...good, nonce }));
    await expect(svc.callback({ state: "forged", code: "c" }, NOW)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(svc.callback({ code: "c" }, NOW)).rejects.toMatchObject({ code: "invalid_state" });

    const state = begin().searchParams.get("state") ?? "";
    await svc.callback({ state, code: "c" }, NOW);
    await expect(svc.callback({ state, code: "c" }, NOW)).rejects.toMatchObject({ code: "invalid_state" }); // replay

    const late = begin().searchParams.get("state") ?? "";
    await expect(svc.callback({ state: late, code: "c" }, NOW + STATE_TTL_MS)).rejects.toMatchObject({ code: "invalid_state" });

    const err = begin().searchParams.get("state") ?? "";
    await expect(svc.callback({ state: err, error: "access_denied" }, NOW)).rejects.toMatchObject({ code: "provider_error" });

    const wrong = setup(() => jwt({ ...good, nonce: "attacker" }));
    const s2 = wrong.begin().searchParams.get("state") ?? "";
    await expect(wrong.svc.callback({ state: s2, code: "c" }, NOW)).rejects.toMatchObject({ code: "invalid_nonce" });
  });

  it("config: nothing without every value; https only", () => {
    expect(loadOidcConfig({})).toBeNull();
    expect(loadOidcConfig({ ONEID_OIDC_ISSUER: ISS })).toBeNull();
    const full = {
      ONEID_OIDC_ISSUER: ISS,
      ONEID_OIDC_CLIENT_ID: CLIENT,
      ONEID_OIDC_REDIRECT_URI: "https://lexi.example.test/cb",
      ONEID_OIDC_AUTHORIZATION_ENDPOINT: "https://idp.example.test/authorize",
    };
    expect(loadOidcConfig(full)?.issuer).toBe(ISS);
    expect(() => loadOidcConfig({ ...full, ONEID_OIDC_ISSUER: "http://idp.example.test" })).toThrow(/https/);
  });
});

import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { DOCUMENT_CONTENT_TYPES, DOCUMENT_MAX_BYTES } from "@lex/contracts";

/** JSON bodies: the largest real payload is an application's fields (each value ≤ 2000 chars). */
export const JSON_BODY_LIMIT = "64kb";
/** Form bodies are not used by the API; kept tiny. */
export const FORM_BODY_LIMIT = "8kb";

/**
 * TRUST_PROXY: unset/"false" -> req.ip is the TCP peer, X-Forwarded-For is ignored (default).
 * Behind a reverse proxy set the hop count ("1") or the proxy addresses ("loopback",
 * "10.0.0.0/8", comma-separated). "true" (trust everyone) is refused: any client could then
 * forge X-Forwarded-For and escape per-IP rate limits.
 */
export function trustProxySetting(raw: string | undefined): false | number | string {
  const v = (raw ?? "").trim();
  if (v === "" || v.toLowerCase() === "false") return false;
  if (v.toLowerCase() === "true") throw new Error('TRUST_PROXY=true is not allowed: use a hop count ("1") or proxy addresses');
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

/**
 * HTTP hardening shared by main.ts and the integration tests. Call before app.init()/listen(),
 * i.e. before routes are registered, so it runs first for every request:
 * security headers (helmet), explicit body size limits, trust-proxy for the client IP.
 */
export function hardenHttp(app: NestExpressApplication, env: NodeJS.ProcessEnv = process.env): void {
  app.set("trust proxy", trustProxySetting(env.TRUST_PROXY));
  app.disable("x-powered-by");
  app.use(
    helmet({
      // JSON/PDF API: nothing may be loaded or framed from its responses.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
      },
      referrerPolicy: { policy: "no-referrer" },
      // CORS fetches from the web app are governed by CORS, not CORP; no-cors embeds stay same-site.
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });
  app.useBodyParser("urlencoded", { limit: FORM_BODY_LIMIT, extended: false });
  // Document uploads: raw bytes, only for the allowed types (the service re-checks the bytes).
  app.useBodyParser("raw", { type: [...DOCUMENT_CONTENT_TYPES], limit: DOCUMENT_MAX_BYTES });
}

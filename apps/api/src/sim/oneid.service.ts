import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { SimCitizen, type SimCitizenSummary, type SimSession } from "@lex/contracts";
import { JsonStore } from "../common/json-store";
import { runtimeFile, simDataDir } from "../common/paths";
import { hashSecret, newSecret } from "../common/secrets";

const CitizensFile = z.object({ $comment: z.string().optional(), citizens: z.array(SimCitizen).min(1) });

/** Absolute session lifetime. */
export const SESSION_TTL_MS = 8 * 3600 * 1000;
/** Inactivity timeout (sliding). */
export const SESSION_IDLE_MS = 60 * 60 * 1000;
/** lastSeenAt is written at most this often (avoids a disk write per request). */
const TOUCH_EVERY_MS = 60 * 1000;

const IsoDate = z.string().datetime({ offset: true });
/** Stored by sha256(token); holds the citizen id only — the profile comes from the fixtures. */
const StoredSession = z.object({
  citizenId: z.string(),
  createdAt: IsoDate,
  expiresAt: IsoDate,
  lastSeenAt: IsoDate,
  revokedAt: IsoDate.nullable(),
});
type StoredSession = z.infer<typeof StoredSession>;

/**
 * SIMULATOR of OneID login. Not connected to the real OneID in any way:
 * the user picks one of the fictional test citizens from data/sim/citizens.json.
 *
 * Sessions: 256-bit opaque tokens, stored only as SHA-256 (data/runtime/oneid-sessions.json),
 * 8 h absolute and 60 min idle expiry, logout (one) and logout-all (every session of the
 * citizen), rotation on login (the presented old token is revoked). The pre-2026-11-21
 * sessions.json (plaintext tokens) is no longer read: those sessions are invalid.
 */
@Injectable()
export class OneIdSimulatorService {
  private readonly citizens: readonly SimCitizen[];
  private readonly sessions = new JsonStore<StoredSession>(runtimeFile("oneid-sessions.json"), StoredSession);

  constructor() {
    const raw: unknown = JSON.parse(readFileSync(join(simDataDir(), "citizens.json"), "utf8"));
    this.citizens = CitizensFile.parse(raw).citizens;
  }

  listCitizens(): readonly SimCitizen[] {
    return this.citizens;
  }

  /** Login picker: names only (no PINFL, phone or address before login). */
  listSummaries(): SimCitizenSummary[] {
    return this.citizens.map((c) => ({ id: c.id, fio: c.fio, simulated: c.simulated }));
  }

  citizen(id: string): SimCitizen {
    const c = this.citizens.find((x) => x.id === id);
    if (!c) throw new NotFoundException(`Test citizen ${id} not found`);
    return c;
  }

  /** New session; a previous token presented with the login is revoked (rotation). */
  async login(citizenId: string, previousToken?: string, now = Date.now()): Promise<SimSession> {
    const citizen = this.citizen(citizenId);
    if (previousToken) this.revoke(previousToken, now);
    const token = newSecret();
    const at = new Date(now).toISOString();
    const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
    this.sessions.set(hashSecret(token), { citizenId, createdAt: at, expiresAt, lastSeenAt: at, revokedAt: null });
    await this.sessions.persist("oneid.login");
    return { token, citizen, createdAt: at, expiresAt };
  }

  /** Resolves the session from the x-sim-session header value. */
  session(token: string | undefined): SimSession {
    const s = this.find(token);
    if (!s) throw new UnauthorizedException("OneID simulator session required (x-sim-session)");
    return s;
  }

  /** The live session for a token, or null (unknown, revoked, expired or idle). Never throws. */
  find(token: string | undefined, now = Date.now()): SimSession | null {
    if (!token) return null;
    const key = hashSecret(token);
    const s = this.sessions.get(key);
    if (!s || s.revokedAt) return null;
    if (Date.parse(s.expiresAt) <= now || Date.parse(s.lastSeenAt) + SESSION_IDLE_MS <= now) return null;
    if (now - Date.parse(s.lastSeenAt) >= TOUCH_EVERY_MS) this.sessions.set(key, { ...s, lastSeenAt: new Date(now).toISOString() });
    const citizen = this.citizens.find((c) => c.id === s.citizenId);
    return citizen ? { token, citizen, createdAt: s.createdAt, expiresAt: s.expiresAt } : null;
  }

  /** Logout: revokes this token. Returns false for an unknown/already revoked token. */
  revoke(token: string, now = Date.now()): boolean {
    const key = hashSecret(token);
    const s = this.sessions.get(key);
    if (!s || s.revokedAt) return false;
    this.sessions.set(key, { ...s, revokedAt: new Date(now).toISOString() });
    return true;
  }

  /** Logout everywhere: revokes every live session of the citizen. Returns how many. */
  revokeAll(citizenId: string, now = Date.now()): number {
    let n = 0;
    for (const [key, s] of this.sessions.entries()) {
      if (s.citizenId === citizenId && !s.revokedAt) {
        this.sessions.set(key, { ...s, revokedAt: new Date(now).toISOString() });
        n++;
      }
    }
    return n;
  }

  persist(operation = "oneid.persist"): Promise<void> {
    return this.sessions.persist(operation);
  }
}

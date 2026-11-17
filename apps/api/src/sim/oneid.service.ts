import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { SimCitizen, SimSession } from "@lex/contracts";
import { JsonStore } from "../common/json-store";
import { runtimeFile, simDataDir } from "../common/paths";

const CitizensFile = z.object({ $comment: z.string().optional(), citizens: z.array(SimCitizen).min(1) });

/**
 * SIMULATOR of OneID login. Not connected to the real OneID in any way:
 * the user picks one of the fictional test citizens from data/sim/citizens.json.
 */
@Injectable()
export class OneIdSimulatorService {
  private readonly citizens: readonly SimCitizen[];
  private readonly sessions = new JsonStore<SimSession>(runtimeFile("sessions.json"), SimSession);

  constructor() {
    const raw: unknown = JSON.parse(readFileSync(join(simDataDir(), "citizens.json"), "utf8"));
    this.citizens = CitizensFile.parse(raw).citizens;
  }

  listCitizens(): readonly SimCitizen[] {
    return this.citizens;
  }

  citizen(id: string): SimCitizen {
    const c = this.citizens.find((x) => x.id === id);
    if (!c) throw new NotFoundException(`Test citizen ${id} not found`);
    return c;
  }

  async login(citizenId: string): Promise<SimSession> {
    const session: SimSession = { token: randomUUID(), citizen: this.citizen(citizenId), createdAt: new Date().toISOString() };
    this.sessions.set(session.token, session);
    await this.sessions.persist("oneid.login");
    return session;
  }

  /** Resolves the session from the x-sim-session header value. */
  session(token: string | undefined): SimSession {
    const s = token ? this.sessions.get(token) : undefined;
    if (!s) throw new UnauthorizedException("OneID simulator session required (x-sim-session)");
    return s;
  }
}

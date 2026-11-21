import { type CanActivate, Injectable, NotFoundException } from "@nestjs/common";

/**
 * SIM_MODE=true turns on the simulators (OneID login, ERI test keys, mock agency and its cabinet,
 * emergency-call simulator). Default: off — simulator routes answer 404 and no fake identity exists.
 * Read on every call, so tests can switch it per application instance.
 */
export function simModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.SIM_MODE ?? "").trim().toLowerCase() === "true";
}

/** Simulator-only routes: 404 when SIM_MODE is off (the route looks absent). */
@Injectable()
export class SimModeGuard implements CanActivate {
  canActivate(): boolean {
    if (!simModeEnabled()) throw new NotFoundException();
    return true;
  }
}

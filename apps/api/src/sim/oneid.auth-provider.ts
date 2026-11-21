import { SIM_SESSION_HEADER } from "@lex/contracts";
import type { AuthenticatedCitizen, AuthProvider, RequestHeaders } from "../auth/auth-provider";
import { headerValue } from "../auth/auth-provider";
import { simModeEnabled } from "../auth/sim-mode";
import type { OneIdSimulatorService } from "./oneid.service";

/**
 * DEVELOPMENT authentication: a OneID SIMULATOR session (x-sim-session) of a fictional test
 * citizen. Works only with SIM_MODE=true. This is not production authentication.
 */
export class OneIdSimulatorAuthProvider implements AuthProvider {
  readonly id = "oneid-simulator";
  readonly simulated = true;

  constructor(private readonly oneId: OneIdSimulatorService) {}

  authenticate(headers: RequestHeaders): AuthenticatedCitizen | null {
    if (!simModeEnabled()) return null;
    const session = this.oneId.find(headerValue(headers, SIM_SESSION_HEADER));
    return session ? { citizen: session.citizen, provider: this.id, simulated: true } : null;
  }
}

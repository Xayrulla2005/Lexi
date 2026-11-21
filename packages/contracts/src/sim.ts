import { z } from "zod";
import { IsoDateTime, Slug } from "./common";

/**
 * SIMULATOR contracts. There is no real OneID / e-signature integration:
 * every citizen here is a fictional test person from data/sim/citizens.json.
 */

export const SimCitizen = z.object({
  id: Slug,
  fio: z.string().min(1),
  /** Deliberately fake PINFL (e.g. 00000000000001). */
  pinfl: z.string().regex(/^\d{14}$/),
  manzil: z.string().min(1),
  telefon: z.string().min(1),
  simulated: z.literal(true),
});
export type SimCitizen = z.infer<typeof SimCitizen>;

export const SimLoginRequest = z.object({ citizenId: Slug });
export type SimLoginRequest = z.infer<typeof SimLoginRequest>;

/**
 * Simulated OneID session. The token (opaque, 256-bit; only its hash is stored) is sent back in
 * the `x-sim-session` header — never in a URL or cookie. Expires at `expiresAt` (absolute) or
 * after inactivity; logout revokes it; a new login rotates it.
 */
export const SimSession = z.object({
  token: z.string().min(32),
  citizen: SimCitizen,
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
});
export type SimSession = z.infer<typeof SimSession>;

/** Header carrying the simulated session token. */
export const SIM_SESSION_HEADER = "x-sim-session";

/** Login picker entry: no PINFL, phone or address before login. */
export const SimCitizenSummary = SimCitizen.pick({ id: true, fio: true, simulated: true });
export type SimCitizenSummary = z.infer<typeof SimCitizenSummary>;

/**
 * SIMULATOR agency cabinet session (a demo officer of ONE agency). Separate from citizen
 * sessions: a citizen token never opens the cabinet, and an officer sees only their agency.
 */
export const SIM_AGENCY_SESSION_HEADER = "x-sim-agency-session";

export const SimAgencyLoginRequest = z.object({
  agencyId: Slug,
  /** Required only when the server sets SIM_AGENCY_PASSCODE. */
  passcode: z.string().max(200).optional(),
});
export type SimAgencyLoginRequest = z.infer<typeof SimAgencyLoginRequest>;

export const SimAgencySession = z.object({
  token: z.string().min(32),
  agencyId: Slug,
  agencyName: z.string().min(1),
  expiresAt: IsoDateTime,
  simulated: z.literal(true),
});
export type SimAgencySession = z.infer<typeof SimAgencySession>;

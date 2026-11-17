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

/** Simulated OneID session. The token is sent back in the `x-sim-session` header. */
export const SimSession = z.object({
  token: z.string().uuid(),
  citizen: SimCitizen,
  createdAt: IsoDateTime,
});
export type SimSession = z.infer<typeof SimSession>;

/** Header carrying the simulated session token. */
export const SIM_SESSION_HEADER = "x-sim-session";

/** XAYRULLA: OneID SIMULYATOR sessiyasi brauzerning sessionStorage'ida (faqat shu tab uchun). */
import { SimSession } from "@lex/contracts";

const KEY = "lex.sim.session";

export function loadSession(): SimSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = SimSession.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SimSession | null): void {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode) — the session lives only in memory for this page.
  }
}

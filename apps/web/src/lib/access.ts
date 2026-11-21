/**
 * XAYRULLA: access secrets kept in the browser.
 * - conversation access token (x-conversation-token): localStorage, so the chat survives a reload;
 *   the conversation id alone opens nothing on the server;
 * - SIMULATOR agency-cabinet sessions (x-sim-agency-session): sessionStorage, this tab only.
 * Storage can be unavailable (private mode): then the values live only for this page view.
 */
const CONV_KEY = "lex.conversation.access";
const AGENCY_KEY = "lex.sim.agency";

export interface StoredConversationAccess {
  id: string;
  token: string;
}

let memoryConv: StoredConversationAccess | null = null;
let memoryAgency: Record<string, string> = {};

export function loadConversationAccess(): StoredConversationAccess | null {
  try {
    const raw = localStorage.getItem(CONV_KEY);
    if (!raw) return memoryConv;
    const v = JSON.parse(raw) as Partial<StoredConversationAccess>;
    return typeof v.id === "string" && typeof v.token === "string" ? { id: v.id, token: v.token } : null;
  } catch {
    return memoryConv;
  }
}

export function saveConversationAccess(v: StoredConversationAccess | null): void {
  memoryConv = v;
  try {
    if (v) localStorage.setItem(CONV_KEY, JSON.stringify(v));
    else localStorage.removeItem(CONV_KEY);
  } catch {
    // Storage unavailable: kept in memory only.
  }
}

/** Token for this conversation id, if this browser has one. */
export function conversationToken(id: string): string | null {
  const v = loadConversationAccess();
  return v && v.id === id ? v.token : null;
}

function agencySessions(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(AGENCY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : memoryAgency;
  } catch {
    return memoryAgency;
  }
}

export function agencySession(agencyId: string): string | null {
  return agencySessions()[agencyId] ?? null;
}

export function saveAgencySession(agencyId: string, token: string | null): void {
  const all = { ...agencySessions() };
  if (token) all[agencyId] = token;
  else delete all[agencyId];
  memoryAgency = all;
  try {
    sessionStorage.setItem(AGENCY_KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable: kept in memory only.
  }
}

const IDEM_PREFIX = "lex.idem.";

/**
 * Idempotency-Key for submitting one application: the same key for every retry of this
 * application in this tab, so a repeated click or a retry after a timeout returns the
 * original submission instead of creating a second one.
 */
export function submitKey(applicationId: string): string {
  try {
    const known = sessionStorage.getItem(IDEM_PREFIX + applicationId);
    if (known) return known;
    const key = `submit-${crypto.randomUUID()}`;
    sessionStorage.setItem(IDEM_PREFIX + applicationId, key);
    return key;
  } catch {
    return `submit-${applicationId}`;
  }
}

const PRO_KEY = "lex.sim.professional";

/** SIMULATOR lawyer-cabinet session token (this tab only). */
export function professionalSession(): string | null {
  try {
    return sessionStorage.getItem(PRO_KEY);
  } catch {
    return null;
  }
}

export function saveProfessionalSession(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(PRO_KEY, token);
    else sessionStorage.removeItem(PRO_KEY);
  } catch {
    // Storage unavailable: the user logs in again on reload.
  }
}

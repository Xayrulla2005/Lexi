import { createHash, randomBytes } from "node:crypto";

/**
 * Opaque bearer secrets (conversation tokens, handoff codes, simulator officer sessions).
 * 256 random bits, URL-safe. Only SHA-256 hashes are stored: the secrets have full entropy,
 * so a fast hash is enough (no password-style stretching needed).
 */
export const newSecret = (): string => randomBytes(32).toString("base64url");

export const hashSecret = (secret: string): string => createHash("sha256").update(secret, "utf8").digest("hex");

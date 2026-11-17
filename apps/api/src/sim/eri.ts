import { createHash, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import type { EriSignature, SignatureVerification } from "@lex/contracts";

/**
 * SIMULATED e-signature (ERI). Pure functions, no key storage.
 * The signed message is the raw SHA-256 digest of the exact PDF bytes.
 */

export const sha256 = (bytes: Buffer): Buffer => createHash("sha256").update(bytes).digest();

export function signPdf(pdf: Buffer, privateKey: KeyObject, publicKeyPem: string, signerCitizenId: string): EriSignature {
  const digest = sha256(pdf);
  return {
    simulated: true,
    algorithm: "Ed25519",
    hashAlgorithm: "SHA-256",
    digest: digest.toString("hex"),
    // Ed25519 takes no separate hash algorithm: the algorithm argument must be null.
    signature: sign(null, digest, privateKey).toString("base64"),
    publicKey: publicKeyPem,
    signerCitizenId,
    signedAt: new Date().toISOString(),
  };
}

const VALID: SignatureVerification = { valid: true, message: "Imzo haqiqiy" };
const BROKEN: SignatureVerification = { valid: false, message: "Imzo buzilgan" };

/**
 * Checks that `pdf` is exactly what was signed and that the signature matches the key.
 * `trustedPublicKeyPem`, when given, must equal the key in the package (prevents key swapping).
 */
export function verifyPdf(pdf: Buffer, sig: EriSignature, trustedPublicKeyPem?: string): SignatureVerification {
  if (trustedPublicKeyPem !== undefined && trustedPublicKeyPem.trim() !== sig.publicKey.trim()) return BROKEN;
  const digest = sha256(pdf);
  if (digest.toString("hex") !== sig.digest) return BROKEN;
  try {
    return verify(null, digest, createPublicKey(sig.publicKey), Buffer.from(sig.signature, "base64")) ? VALID : BROKEN;
  } catch {
    return BROKEN;
  }
}

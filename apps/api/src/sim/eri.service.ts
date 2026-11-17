import { Injectable } from "@nestjs/common";
import { createPrivateKey, generateKeyPairSync, type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EriSignature, SignatureVerification } from "@lex/contracts";
import { simKeysDir } from "../common/paths";
import { signPdf, verifyPdf } from "./eri";

interface TestKeyPair {
  privateKey: KeyObject;
  publicKeyPem: string;
}

/**
 * SIMULATOR of an e-signature (ERI) provider. One Ed25519 test key pair per fictional
 * citizen, stored in data/sim/keys/ (git-ignored) and generated on first use.
 * These keys have no legal meaning and must never be used outside the demo.
 */
@Injectable()
export class EriSimulatorService {
  private readonly cache = new Map<string, TestKeyPair>();

  sign(citizenId: string, pdf: Buffer): EriSignature {
    const keys = this.keyPair(citizenId);
    return signPdf(pdf, keys.privateKey, keys.publicKeyPem, citizenId);
  }

  /** Verifies against the citizen's registered test key, not only the key inside the package. */
  verify(pdf: Buffer, signature: EriSignature): SignatureVerification {
    return verifyPdf(pdf, signature, this.keyPair(signature.signerCitizenId).publicKeyPem);
  }

  publicKey(citizenId: string): string {
    return this.keyPair(citizenId).publicKeyPem;
  }

  private keyPair(citizenId: string): TestKeyPair {
    const cached = this.cache.get(citizenId);
    if (cached) return cached;
    if (!/^[a-z0-9_]+$/.test(citizenId)) throw new Error(`Invalid citizen id ${citizenId}`);

    const dir = simKeysDir();
    const privPath = join(dir, `${citizenId}.key.pem`);
    const pubPath = join(dir, `${citizenId}.pub.pem`);
    let pair: TestKeyPair;
    if (existsSync(privPath) && existsSync(pubPath)) {
      pair = { privateKey: createPrivateKey(readFileSync(privPath, "utf8")), publicKeyPem: readFileSync(pubPath, "utf8") };
    } else {
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
      mkdirSync(dir, { recursive: true });
      writeFileSync(privPath, privateKey.export({ type: "pkcs8", format: "pem" }).toString(), { mode: 0o600 });
      writeFileSync(pubPath, publicKeyPem);
      pair = { privateKey, publicKeyPem };
    }
    this.cache.set(citizenId, pair);
    return pair;
  }
}

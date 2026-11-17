import { Injectable } from "@nestjs/common";
import { createPrivateKey, generateKeyPairSync, type KeyObject } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EriSignature, SignatureVerification } from "@lex/contracts";
import { simKeysDir } from "../common/paths";
import { withTimeout } from "../common/timeout";
import { signPdf, verifyPdf } from "./eri";

interface TestKeyPair {
  privateKey: KeyObject;
  publicKeyPem: string;
}

const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false,
  );

/**
 * SIMULATOR of an e-signature (ERI) provider. One Ed25519 test key pair per fictional
 * citizen, stored in data/sim/keys/ (git-ignored) and generated on first use.
 * These keys have no legal meaning and must never be used outside the demo.
 * Key file I/O is asynchronous and bounded by the operation timeout.
 */
@Injectable()
export class EriSimulatorService {
  private readonly cache = new Map<string, Promise<TestKeyPair>>();

  async sign(citizenId: string, pdf: Buffer): Promise<EriSignature> {
    const keys = await this.keyPair(citizenId);
    return signPdf(pdf, keys.privateKey, keys.publicKeyPem, citizenId);
  }

  /** Verifies against the citizen's registered test key, not only the key inside the package. */
  async verify(pdf: Buffer, signature: EriSignature): Promise<SignatureVerification> {
    return verifyPdf(pdf, signature, (await this.keyPair(signature.signerCitizenId)).publicKeyPem);
  }

  private keyPair(citizenId: string): Promise<TestKeyPair> {
    if (!/^[a-z0-9_]+$/.test(citizenId)) return Promise.reject(new Error(`Invalid citizen id ${citizenId}`));
    let pair = this.cache.get(citizenId);
    if (!pair) {
      // One load per citizen even under concurrent requests; a failed load is retried next time.
      pair = withTimeout(this.loadOrCreate(citizenId), `eri.keys:${citizenId}`);
      pair.catch(() => this.cache.delete(citizenId));
      this.cache.set(citizenId, pair);
    }
    return pair;
  }

  private async loadOrCreate(citizenId: string): Promise<TestKeyPair> {
    const dir = simKeysDir();
    const privPath = join(dir, `${citizenId}.key.pem`);
    const pubPath = join(dir, `${citizenId}.pub.pem`);
    if ((await exists(privPath)) && (await exists(pubPath))) {
      const [priv, pub] = await Promise.all([readFile(privPath, "utf8"), readFile(pubPath, "utf8")]);
      return { privateKey: createPrivateKey(priv), publicKeyPem: pub };
    }
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    await mkdir(dir, { recursive: true });
    await writeFile(privPath, privateKey.export({ type: "pkcs8", format: "pem" }).toString(), { mode: 0o600 });
    await writeFile(pubPath, publicKeyPem);
    return { privateKey, publicKeyPem };
  }
}

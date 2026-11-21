import { hashSecret } from "../common/secrets";
import { issueHandoff, issueToken, revoke, StoredConversation, TOKEN_TTL_MS, validSecret } from "./conversation-access";

const empty = (): StoredConversation => ({ conversation: {} as StoredConversation["conversation"], tokens: [], handoffs: [] });

describe("conversation access secrets", () => {
  it("stores only the hash and validates the plaintext", () => {
    const { secret, list } = issueToken(empty());
    expect(list).toHaveLength(1);
    expect(list[0]?.hash).toBe(hashSecret(secret));
    expect(JSON.stringify(list)).not.toContain(secret);
    expect(validSecret(list, secret)).toBe(true);
    expect(validSecret(list, `${secret}x`)).toBe(false);
    expect(validSecret(list, undefined)).toBe(false);
  });

  it("expires", () => {
    const t0 = Date.parse("2026-11-21T00:00:00Z");
    const { secret, list } = issueToken(empty(), t0);
    expect(validSecret(list, secret, t0 + TOKEN_TTL_MS - 1)).toBe(true);
    expect(validSecret(list, secret, t0 + TOKEN_TTL_MS)).toBe(false);
  });

  it("revocation is per secret and permanent", () => {
    const first = issueToken(empty());
    const second = issueToken({ ...empty(), tokens: first.list });
    const revoked = revoke(second.list, first.secret);
    expect(revoked).not.toBeNull();
    expect(validSecret(revoked ?? [], first.secret)).toBe(false);
    expect(validSecret(revoked ?? [], second.secret)).toBe(true);
    expect(revoke(revoked ?? [], first.secret)).toBeNull();
  });

  it("handoff codes are separate from tokens", () => {
    const h = issueHandoff(empty());
    expect(validSecret(h.list, h.secret)).toBe(true);
    expect(validSecret([], h.secret)).toBe(false);
  });

  it("reads records stored before access tokens existed (bare conversation)", () => {
    const parsed = StoredConversation.safeParse({ id: "not-a-real-conversation" });
    // A bare object is wrapped as { conversation }; it then fails only on the conversation schema.
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path[0]).toBe("conversation");
  });
});

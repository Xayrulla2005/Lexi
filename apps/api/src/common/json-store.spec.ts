import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { JsonStore } from "./json-store";
import { OperationTimeoutError, RETRY_MESSAGE, withTimeout } from "./timeout";

describe("JsonStore", () => {
  it("coalesces many writes into serialized atomic writes and leaves no temp files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lex-store-"));
    const file = join(dir, "items.json");
    const store = new JsonStore(file, z.number());
    for (let i = 0; i < 200; i++) store.set(`k${i % 10}`, i);
    await Promise.all([store.persist(), store.persist()]);

    const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, number>;
    expect(saved.k9).toBe(199);
    expect(Object.keys(saved)).toHaveLength(10);
    expect(readdirSync(dir)).toEqual(["items.json"]);

    // A fresh store reads what was persisted.
    expect(new JsonStore(file, z.number()).get("k0")).toBe(190);
  });

  it("is memory-only without a file", async () => {
    const store = new JsonStore<number>(null, z.number());
    store.set("a", 1);
    await expect(store.persist()).resolves.toBeUndefined();
    expect(store.get("a")).toBe(1);
  });
});

describe("withTimeout", () => {
  it("rejects a hanging operation with \"Qayta urinib ko'ring\" (HTTP 504)", async () => {
    const never = new Promise<never>(() => undefined);
    const err = await withTimeout(never, "test.op", 20).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OperationTimeoutError);
    expect((err as OperationTimeoutError).getStatus()).toBe(504);
    expect((err as OperationTimeoutError).message).toBe(RETRY_MESSAGE);
  });

  it("passes results and errors through", async () => {
    await expect(withTimeout(Promise.resolve(7), "ok", 50)).resolves.toBe(7);
    await expect(withTimeout(Promise.reject(new Error("boom")), "err", 50)).rejects.toThrow("boom");
  });
});

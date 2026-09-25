import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "./ids.js";

const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses crypto.randomUUID when the context is secure", () => {
    const spy = vi.spyOn(globalThis.crypto, "randomUUID");

    expect(randomId()).toMatch(uuidV4);
    expect(spy).toHaveBeenCalledOnce();
  });

  // A page served over plain HTTP on an address has no `randomUUID`; the
  // ids must still be valid v4 UUIDs, distinct from one another.
  it("falls back to getRandomValues without crypto.randomUUID", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
      undefined as never,
    );
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });

    const first = randomId();
    const second = randomId();

    expect(first).toMatch(uuidV4);
    expect(second).toMatch(uuidV4);
    expect(first).not.toBe(second);
  });
});

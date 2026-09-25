import { describe, expect, it } from "vitest";
import { PermissionCache } from "./permissionCache.js";

describe("PermissionCache", () => {
  it("returns cached keys until the TTL elapses", () => {
    let now = 1_000;
    const cache = new PermissionCache(60_000, () => now);

    cache.set("user-1", ["pos.sell"]);
    expect(cache.get("user-1")).toEqual(["pos.sell"]);

    now += 59_999;
    expect(cache.get("user-1")).toEqual(["pos.sell"]);

    now += 1;
    expect(cache.get("user-1")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("hands out a copy so callers cannot mutate the cached keys", () => {
    const cache = new PermissionCache();
    const keys = ["pos.sell"];

    cache.set("user-1", keys);
    keys.push("audit.view");

    expect(cache.get("user-1")).toEqual(["pos.sell"]);
  });

  it("forgets one user or everyone on invalidation", () => {
    const cache = new PermissionCache();
    cache.set("user-1", ["a"]);
    cache.set("user-2", ["b"]);

    cache.invalidateUser("user-1");
    expect(cache.get("user-1")).toBeUndefined();
    expect(cache.get("user-2")).toEqual(["b"]);

    cache.invalidateAll();
    expect(cache.get("user-2")).toBeUndefined();
  });
});

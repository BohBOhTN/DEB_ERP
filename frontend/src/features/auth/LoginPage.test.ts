import { describe, expect, it } from "vitest";
import { safeNext } from "./LoginPage";

describe("post-login destination", () => {
  it("accepts only same-origin paths", () => {
    expect(safeNext("/commandes?page=2")).toBe("/commandes?page=2");
    expect(safeNext("https://evil.example/")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/connexion")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});

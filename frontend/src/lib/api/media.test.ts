import { describe, expect, it } from "vitest";
import { mediaUrl } from "./media.js";

describe("mediaUrl", () => {
  it("keeps the path on one origin", () => {
    expect(mediaUrl("/media/products/a.webp", "/api/v1")).toBe(
      "/media/products/a.webp",
    );
  });

  it("puts the API's origin in front when the API lives elsewhere", () => {
    expect(
      mediaUrl("/media/products/a.webp", "http://localhost:4000/api/v1"),
    ).toBe("http://localhost:4000/media/products/a.webp");
  });

  it("returns null without a photo and leaves an absolute address alone", () => {
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl("https://cdn.example/x.webp", "http://api/api/v1")).toBe(
      "https://cdn.example/x.webp",
    );
  });
});

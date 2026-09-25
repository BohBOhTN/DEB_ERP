import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { correlationId, isAcceptableCorrelationId } from "./correlation.js";

function buildApp() {
  const app = express();
  app.use(correlationId);
  app.get("/", (_req, res) => {
    res.json({ id: res.locals.correlationId });
  });
  return app;
}

describe("correlation id", () => {
  it("echoes a well-formed client id", async () => {
    const response = await request(buildApp())
      .get("/")
      .set("x-correlation-id", "web-7f3a2c1d-9b")
      .expect(200);

    expect(response.body.id).toBe("web-7f3a2c1d-9b");
    expect(response.headers["x-correlation-id"]).toBe("web-7f3a2c1d-9b");
  });

  it("generates an id when none is supplied", async () => {
    const response = await request(buildApp()).get("/").expect(200);

    expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers["x-correlation-id"]).toBe(response.body.id);
  });

  // The value is persisted in audit and ledger rows, so an attacker-controlled
  // blob must never be stored.
  it("replaces an oversized or unprintable client id", async () => {
    const oversized = await request(buildApp())
      .get("/")
      .set("x-correlation-id", "x".repeat(5000))
      .expect(200);
    const unprintable = await request(buildApp())
      .get("/")
      .set("x-correlation-id", "abc def<script>")
      .expect(200);
    const tooShort = await request(buildApp())
      .get("/")
      .set("x-correlation-id", "abc")
      .expect(200);

    for (const response of [oversized, unprintable, tooShort]) {
      expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("accepts UUIDs and short tokens only", () => {
    expect(
      isAcceptableCorrelationId("9b2f6c1e-3a4d-4f5e-8b6c-1d2e3f4a5b6c"),
    ).toBe(true);
    expect(isAcceptableCorrelationId("pos_12345678")).toBe(true);
    expect(isAcceptableCorrelationId("a".repeat(64))).toBe(true);
    expect(isAcceptableCorrelationId("a".repeat(65))).toBe(false);
    expect(isAcceptableCorrelationId("short")).toBe(false);
    expect(isAcceptableCorrelationId("has space 123")).toBe(false);
  });
});

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const healthCheck = async () => ({
  status: "ok" as const,
  service: "api" as const,
  environment: "test",
  database: { status: "ok" as const },
});

describe("app runtime safety", () => {
  it("compresses large responses when the client accepts gzip", async () => {
    // The health payload is the only route an app without services exposes,
    // so a large environment label stands in for a big list response.
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      healthCheck: async () => ({
        ...(await healthCheck()),
        environment: "x".repeat(20_000),
      }),
    });

    const response = await request(app)
      .get("/api/health")
      .set("accept-encoding", "gzip")
      .expect(200);

    expect(response.headers["content-encoding"]).toBe("gzip");
    expect(response.body.data.environment).toHaveLength(20_000);
  });

  it("serves the health probe under both the legacy and the v1 prefix", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      healthCheck,
    });

    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/v1/health").expect(200);
  });

  it("applies the global rate limit per client address behind a trusted proxy", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      healthCheck,
      trustProxy: 1,
      globalRateLimit: { maxRequests: 2, windowMs: 60_000 },
    });

    await request(app)
      .get("/api/health")
      .set("x-forwarded-for", "203.0.113.10")
      .expect(200);
    await request(app)
      .get("/api/health")
      .set("x-forwarded-for", "203.0.113.10")
      .expect(200);
    const limited = await request(app)
      .get("/api/health")
      .set("x-forwarded-for", "203.0.113.10")
      .expect(429);
    // A different client is not affected by the first one's bucket.
    await request(app)
      .get("/api/health")
      .set("x-forwarded-for", "203.0.113.11")
      .expect(200);

    expect(limited.body.error).toMatchObject({
      code: "RATE_LIMITED",
      message: "Trop de tentatives. Veuillez réessayer plus tard.",
    });
    expect(limited.body.error.correlationId).toEqual(expect.any(String));
  });
});

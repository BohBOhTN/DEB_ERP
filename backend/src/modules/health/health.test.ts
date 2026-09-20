import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";

describe("GET /api/health", () => {
  it("returns an ok health envelope with a correlation id", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      healthCheck: async () => ({
        status: "ok",
        service: "api",
        environment: "test",
        database: {
          status: "ok",
        },
      }),
    });

    const response = await request(app)
      .get("/api/health")
      .set("x-correlation-id", "test-correlation-id")
      .expect(200);

    expect(response.body).toEqual({
      data: {
        status: "ok",
        service: "api",
        environment: "test",
        database: {
          status: "ok",
        },
      },
      meta: {
        correlationId: "test-correlation-id",
      },
    });
    expect(response.headers["x-correlation-id"]).toBe("test-correlation-id");
  });

  it("reports degraded status when the database is unavailable", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      healthCheck: async () => ({
        status: "degraded",
        service: "api",
        environment: "test",
        database: {
          status: "unavailable",
        },
      }),
    });

    const response = await request(app).get("/api/health").expect(503);

    expect(response.body.data.status).toBe("degraded");
    expect(response.body.data.database.status).toBe("unavailable");
    expect(response.body.meta.correlationId).toEqual(expect.any(String));
  });
});

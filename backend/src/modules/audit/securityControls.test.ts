import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../middleware/errorHandler.js";
import { correlationId } from "../../shared/correlation.js";
import { createRateLimiter } from "../auth/rateLimit.js";
import {
  clearSessionCookie,
  setSessionCookie,
  type SessionCookieConfig,
} from "../auth/cookies.js";

/// Sprint 14 requires the session, rate-limit, CORS, and CSRF model to be
/// verified rather than assumed. Each control is exercised here directly.
describe("login rate limiting", () => {
  function buildApp(maxAttempts: number, windowMs = 60_000) {
    const app = express();
    app.use(correlationId);
    app.post("/login", createRateLimiter({ maxAttempts, windowMs }), (_q, s) =>
      s.json({ ok: true }),
    );
    app.use(errorHandler);
    return app;
  }

  it("refuses further attempts once the window limit is reached", async () => {
    const app = buildApp(3);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app).post("/login").expect(200);
    }

    const blocked = await request(app).post("/login").expect(429);

    expect(blocked.body.error).toMatchObject({
      code: "RATE_LIMITED",
      message: "Trop de tentatives. Veuillez réessayer plus tard.",
    });
  });

  it("allows attempts again once the window has elapsed", async () => {
    // A one millisecond window expires between requests.
    const app = buildApp(1, 1);

    await request(app).post("/login").expect(200);
    await new Promise((resolve) => setTimeout(resolve, 5));

    await request(app).post("/login").expect(200);
  });

  it("returns a French message and never reveals the limit", async () => {
    const app = buildApp(1);
    await request(app).post("/login").expect(200);

    const blocked = await request(app).post("/login").expect(429);
    const body = JSON.stringify(blocked.body);

    expect(body).not.toContain("maxAttempts");
    expect(body).not.toContain("windowMs");
    expect(blocked.body.error.correlationId).toEqual(expect.any(String));
  });
});

describe("session cookie model", () => {
  const production: SessionCookieConfig = {
    name: "deb_session",
    secure: true,
    maxAgeMs: 1_800_000,
  };

  /// Captures what the helper hands to Express rather than re-implementing it.
  function captureCookie() {
    const calls: Array<{
      name: string;
      value?: string;
      options: CookieOptions;
    }> = [];

    return {
      calls,
      response: {
        cookie(name: string, value: string, options: CookieOptions) {
          calls.push({ name, value, options });
        },
        clearCookie(name: string, options: CookieOptions) {
          calls.push({ name, options });
        },
      },
    };
  }

  it("is httpOnly, sameSite, and secure in production", () => {
    const captured = captureCookie();

    setSessionCookie(captured.response as never, production, "token-value");

    expect(captured.calls[0].options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
    // The token must ride in the cookie, never in a readable response body.
    expect(captured.calls[0].value).toBe("token-value");
  });

  // sameSite is what stops a cross-site form POST riding the session cookie,
  // which is the CSRF model for this API.
  it("keeps httpOnly and sameSite when the session is cleared", () => {
    const captured = captureCookie();

    clearSessionCookie(captured.response as never, production);

    expect(captured.calls[0].options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  });

  it("does not mark the cookie secure outside production", () => {
    const captured = captureCookie();

    setSessionCookie(
      captured.response as never,
      { ...production, secure: false },
      "token-value",
    );

    expect(captured.calls[0].options.secure).toBe(false);
  });
});

interface CookieOptions {
  httpOnly?: boolean;
  sameSite?: string;
  secure?: boolean;
  path?: string;
  maxAge?: number;
}

describe("CORS model", () => {
  it("echoes only a configured origin and allows credentials", async () => {
    const { createApp } = await import("../../app.js");
    const app = createApp({
      allowedOrigins: ["https://caisse.dar-el-barka.tn"],
      healthCheck: async () => ({
        status: "ok",
        service: "api",
        environment: "test",
        database: { status: "ok" },
      }),
    });

    const allowed = await request(app)
      .get("/api/health")
      .set("Origin", "https://caisse.dar-el-barka.tn");

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://caisse.dar-el-barka.tn",
    );
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const foreign = await request(app)
      .get("/api/health")
      .set("Origin", "https://attacker.example");

    // A foreign origin gets no allow-origin header, so the browser blocks the
    // response. A wildcard would be fatal with credentials enabled.
    expect(foreign.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

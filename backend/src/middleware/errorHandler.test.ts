import { Prisma } from "@prisma/client";
import express from "express";
import request from "supertest";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { AppError } from "../shared/appError.js";
import { correlationId } from "../shared/correlation.js";
import { createLogger } from "../shared/logger.js";
import { errorHandler } from "./errorHandler.js";
import { requestLogger } from "./requestLogger.js";

/// Collects every log line the app writes so a test can assert on it.
function captureLogs() {
  const lines: Array<Record<string, unknown>> = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      for (const line of String(chunk).split("\n")) {
        if (line.trim()) {
          lines.push(JSON.parse(line) as Record<string, unknown>);
        }
      }
      callback();
    },
  });

  return { lines, logger: createLogger({ level: "info", destination }) };
}

function knownRequestError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("database said no", {
    code,
    clientVersion: "test",
  });
}

function buildApp(logs = captureLogs()) {
  const app = express();
  app.use(correlationId);
  app.use(requestLogger(logs.logger));
  app.use(express.json({ limit: "1kb" }));

  app.get("/boom", () => {
    throw new Error("unexpected failure with /Users/secret/path");
  });
  app.get("/unique", () => {
    throw knownRequestError("P2002");
  });
  app.get("/foreign-key", () => {
    throw knownRequestError("P2003");
  });
  app.get("/missing", () => {
    throw knownRequestError("P2025");
  });
  app.get("/deadlock", () => {
    throw knownRequestError("P2034");
  });
  app.get("/unavailable", () => {
    throw new Prisma.PrismaClientInitializationError(
      "Can't reach database server at 10.0.0.5:5432",
      "test",
    );
  });
  app.get("/known", () => {
    throw new AppError({
      statusCode: 409,
      code: "VERSION_CONFLICT",
      message: "Cette fiche a été modifiée entre-temps.",
    });
  });
  app.post("/echo", (req, res) => {
    res.json(req.body);
  });

  app.use(errorHandler);
  return { app, logs };
}

describe("error handler mapping", () => {
  it("maps malformed JSON to a 400 validation error, not a server error", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post("/echo")
      .set("content-type", "application/json")
      .send('{"broken":')
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Le corps de la requête est illisible.",
    });
    expect(JSON.stringify(response.body)).not.toContain("Unexpected");
  });

  it("maps an oversized body to 413", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post("/echo")
      .send({ padding: "x".repeat(4096) })
      .expect(413);

    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("maps Prisma unique and foreign-key violations to 409", async () => {
    const { app } = buildApp();

    const unique = await request(app).get("/unique").expect(409);
    const foreignKey = await request(app).get("/foreign-key").expect(409);

    expect(unique.body.error.code).toBe("STATE_CONFLICT");
    expect(foreignKey.body.error.code).toBe("STATE_CONFLICT");
    expect(JSON.stringify(unique.body)).not.toContain("database said no");
  });

  it("maps a missing Prisma record to 404", async () => {
    const { app } = buildApp();

    const response = await request(app).get("/missing").expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("maps a write conflict to a retryable 409", async () => {
    const { app } = buildApp();

    const response = await request(app).get("/deadlock").expect(409);

    expect(response.body.error.code).toBe("RETRYABLE_CONFLICT");
  });

  it("maps a database outage to 503 without leaking the host", async () => {
    const { app } = buildApp();

    const response = await request(app).get("/unavailable").expect(503);

    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("10.0.0.5");
  });

  it("passes an application error through unchanged", async () => {
    const { app } = buildApp();

    const response = await request(app).get("/known").expect(409);

    expect(response.body.error).toMatchObject({
      code: "VERSION_CONFLICT",
      message: "Cette fiche a été modifiée entre-temps.",
    });
  });
});

describe("error handler logging", () => {
  // AS-V2-01: the correlation id returned to the client is the one in the log.
  it("logs an unexpected failure with the correlation id the client received", async () => {
    const { app, logs } = buildApp();

    const response = await request(app)
      .get("/boom")
      .set("x-correlation-id", "trace-abc-12345")
      .expect(500);

    expect(response.body.error.correlationId).toBe("trace-abc-12345");

    const failure = logs.lines.find((line) => line.msg === "request failed");
    expect(failure).toBeDefined();
    expect(failure).toMatchObject({
      level: 50,
      correlationId: "trace-abc-12345",
      code: "RETRYABLE_SERVER_ERROR",
    });
    expect((failure?.err as { stack?: string }).stack).toContain(
      "unexpected failure",
    );

    const completed = logs.lines.find(
      (line) => line.msg === "request completed",
    );
    expect(completed).toMatchObject({
      correlationId: "trace-abc-12345",
      method: "GET",
      route: "/boom",
      status: 500,
    });
    expect(typeof completed?.durationMs).toBe("number");
  });

  it("logs a client error as a warning without a stack", async () => {
    const { app, logs } = buildApp();

    await request(app).get("/known").expect(409);

    const rejected = logs.lines.find((line) => line.msg === "request rejected");
    expect(rejected).toMatchObject({ level: 40, code: "VERSION_CONFLICT" });
    expect(rejected?.err).toBeUndefined();
  });
});

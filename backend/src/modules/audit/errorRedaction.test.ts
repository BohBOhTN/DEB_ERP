import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "../../middleware/errorHandler.js";
import { correlationId } from "../../shared/correlation.js";
import { AppError } from "../../shared/appError.js";

/// The API rules forbid returning stack traces, secrets, SQL details, or
/// internal paths, and the language rule forbids leaking a raw English
/// exception to the interface. Both are release blockers, so they are asserted
/// against the real error handler.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(correlationId);

  app.get("/boom", () => {
    throw new Error(
      "connect ECONNREFUSED 10.0.0.5:5432 at /Users/secret/app/src/db.ts:42",
    );
  });

  app.get("/prisma-boom", () => {
    const error = new Error(
      "Invalid `prisma.sale.create()` invocation in /srv/app/dist/pos.js:88\\n" +
        "Foreign key constraint failed on the field: `sales_customer_id_fkey`",
    );
    error.name = "PrismaClientKnownRequestError";
    throw error;
  });

  app.post("/validate", (req) => {
    z.object({
      name: z.string().trim().min(1),
      amountTnd: z.coerce.number().positive(),
      lines: z.array(z.object({ id: z.string() })).min(1),
    }).parse(req.body);
  });

  app.get("/known", () => {
    throw new AppError({
      statusCode: 409,
      code: "POS_SESSION_NOT_OPEN",
      message: "Ouvrez une session de caisse avant de vendre.",
    });
  });

  app.use(errorHandler);
  return app;
}

describe("error redaction", () => {
  it("never returns a stack trace, host, or file path", async () => {
    const response = await request(buildApp()).get("/boom").expect(500);
    const body = JSON.stringify(response.body);

    expect(response.body.error).toMatchObject({
      code: "RETRYABLE_SERVER_ERROR",
      message: "Une erreur est survenue. Veuillez réessayer.",
    });
    expect(body).not.toContain("ECONNREFUSED");
    expect(body).not.toContain("10.0.0.5");
    expect(body).not.toContain("/Users/");
    expect(body).not.toContain("db.ts");
    expect(body).not.toContain("stack");
  });

  it("never leaks SQL or schema details from a database error", async () => {
    const response = await request(buildApp()).get("/prisma-boom").expect(500);
    const body = JSON.stringify(response.body);

    expect(body).not.toContain("prisma");
    expect(body).not.toContain("sales_customer_id_fkey");
    expect(body).not.toContain("Foreign key");
    expect(body).not.toContain("/srv/");
  });

  it("returns a correlation id so a failure stays traceable", async () => {
    const response = await request(buildApp()).get("/boom").expect(500);

    expect(response.body.error.correlationId).toEqual(expect.any(String));
    expect(response.body.error.correlationId.length).toBeGreaterThan(0);
  });

  it("passes a known application error through with its French message", async () => {
    const response = await request(buildApp()).get("/known").expect(409);

    expect(response.body.error).toMatchObject({
      code: "POS_SESSION_NOT_OPEN",
      message: "Ouvrez une session de caisse avant de vendre.",
    });
  });
});

describe("validation messages are French", () => {
  it("translates every field error and leaks no English", async () => {
    const response = await request(buildApp())
      .post("/validate")
      .send({ amountTnd: -5, lines: [] })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.fieldErrors).toMatchObject({
      name: "Ce champ est obligatoire.",
      lines: "Ajoutez au moins un élément.",
    });

    // Zod's own wording must never reach the interface.
    const body = JSON.stringify(response.body);
    for (const englishFragment of [
      "Invalid input",
      "expected",
      "received",
      "Too small",
      "Too big",
      "Required",
      "String must contain",
    ]) {
      expect(body).not.toContain(englishFragment);
    }
  });

  // .positive() is an exclusive zero minimum, so the message must not say the
  // value may be zero.
  it("describes a too-small number without Zod wording", async () => {
    const response = await request(buildApp())
      .post("/validate")
      .send({ name: "Test", amountTnd: -5, lines: [{ id: "a" }] })
      .expect(400);

    expect(response.body.error.fieldErrors.amountTnd).toBe(
      "Cette valeur doit être supérieure à zéro.",
    );
  });

  it("reports the first problem per field rather than a list", async () => {
    const response = await request(buildApp())
      .post("/validate")
      .send({})
      .expect(400);

    for (const message of Object.values(
      response.body.error.fieldErrors as Record<string, string>,
    )) {
      expect(typeof message).toBe("string");
      expect(message.endsWith(".")).toBe(true);
    }
  });
});

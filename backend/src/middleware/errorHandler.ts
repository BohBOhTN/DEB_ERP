import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/appError.js";
import { getCorrelationId } from "../shared/correlation.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  const correlationId = getCorrelationId(response);

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
        correlationId,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Les donnees saisies sont invalides.",
        fieldErrors: Object.fromEntries(
          error.issues.map((issue) => [issue.path.join("."), issue.message]),
        ),
        correlationId,
      },
    });
    return;
  }

  response.status(500).json({
    error: {
      code: "RETRYABLE_SERVER_ERROR",
      message: "Une erreur est survenue. Veuillez reessayer.",
      correlationId,
    },
  });
};

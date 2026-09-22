import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/appError.js";
import { getCorrelationId } from "../shared/correlation.js";
import { getLogger } from "../shared/logger.js";
import { messages } from "../shared/messages.js";
import { toFrenchFieldErrors } from "../shared/validationMessages.js";

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

/// Errors raised by `express.json()` (through `http-errors`) carry a `type`
/// and a `status`. They are client mistakes, not server failures, and must not
/// be reported as retryable.
interface HttpLibraryError {
  status?: number;
  statusCode?: number;
  type?: string;
  expose?: boolean;
}

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  const correlationId = getCorrelationId(response);
  const body = describe(error);
  const logger = getLogger(response);

  if (body.statusCode >= 500) {
    logger.error({ err: error, code: body.code }, "request failed");
  } else {
    logger.warn(
      { code: body.code, status: body.statusCode },
      "request rejected",
    );
  }

  response.status(body.statusCode).json({
    error: {
      code: body.code,
      message: body.message,
      fieldErrors: body.fieldErrors,
      correlationId,
    },
  });
};

function describe(error: unknown): ErrorBody {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: messages.VALIDATION_ERROR,
      fieldErrors: toFrenchFieldErrors(error),
    };
  }

  const bodyParser = describeBodyParserError(error);
  if (bodyParser) {
    return bodyParser;
  }

  const prisma = describePrismaError(error);
  if (prisma) {
    return prisma;
  }

  return {
    statusCode: 500,
    code: "RETRYABLE_SERVER_ERROR",
    message: messages.RETRYABLE_SERVER_ERROR,
  };
}

function describeBodyParserError(error: unknown): ErrorBody | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as HttpLibraryError;
  const status = candidate.status ?? candidate.statusCode;

  if (typeof status !== "number" || status < 400 || status >= 500) {
    return null;
  }

  switch (candidate.type) {
    case "entity.parse.failed":
    case "entity.verify.failed":
      return {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: messages.MALFORMED_BODY,
      };
    case "entity.too.large":
      return {
        statusCode: 413,
        code: "PAYLOAD_TOO_LARGE",
        message: messages.PAYLOAD_TOO_LARGE,
      };
    case "encoding.unsupported":
    case "charset.unsupported":
      return {
        statusCode: 415,
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: messages.UNSUPPORTED_MEDIA_TYPE,
      };
    default:
      // Any other http-errors instance with an explicit 4xx status is still a
      // client error, but its English message is never forwarded.
      return candidate.expose === true
        ? {
            statusCode: status,
            code: "BAD_REQUEST",
            message: messages.BAD_REQUEST,
          }
        : null;
  }
}

function describePrismaError(error: unknown): ErrorBody | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return {
          statusCode: 409,
          code: "STATE_CONFLICT",
          message: messages.UNIQUE_CONFLICT,
        };
      case "P2003":
        return {
          statusCode: 409,
          code: "STATE_CONFLICT",
          message: messages.REFERENCE_CONFLICT,
        };
      case "P2025":
        return {
          statusCode: 404,
          code: "NOT_FOUND",
          message: messages.NOT_FOUND,
        };
      case "P2034":
        // Write conflict or deadlock: the client may safely retry.
        return {
          statusCode: 409,
          code: "RETRYABLE_CONFLICT",
          message: messages.RETRYABLE_CONFLICT,
        };
      default:
        return null;
    }
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return {
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
      message: messages.SERVICE_UNAVAILABLE,
    };
  }

  return null;
}

import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/appError.js";

interface AttemptBucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(params: {
  maxAttempts: number;
  windowMs: number;
}) {
  const attempts = new Map<string, AttemptBucket>();

  return (request: Request, _response: Response, next: NextFunction): void => {
    const key = request.ip ?? "unknown";
    const now = Date.now();
    const bucket = attempts.get(key);

    if (!bucket || bucket.resetAt <= now) {
      attempts.set(key, {
        count: 1,
        resetAt: now + params.windowMs,
      });
      next();
      return;
    }

    if (bucket.count >= params.maxAttempts) {
      next(
        new AppError({
          statusCode: 429,
          code: "RATE_LIMITED",
          message: "Trop de tentatives. Veuillez reessayer plus tard.",
        }),
      );
      return;
    }

    bucket.count += 1;
    next();
  };
}

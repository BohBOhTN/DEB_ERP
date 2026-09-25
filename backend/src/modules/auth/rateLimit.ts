import { rateLimit, type RateLimitRequestHandler } from "express-rate-limit";
import { AppError } from "../../shared/appError.js";
import { messages } from "../../shared/messages.js";

/// Backed by express-rate-limit's memory store, which prunes expired buckets
/// on its own; the previous hand-rolled map grew by one entry per distinct
/// client address for the life of the process. The client address respects
/// `trust proxy`, which `createApp` sets from configuration.
///
/// Rate-limit headers are deliberately disabled: the limit is not something the
/// interface needs, and the security tests assert it is never revealed.
export function createRateLimiter(params: {
  maxAttempts: number;
  windowMs: number;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: params.windowMs,
    limit: params.maxAttempts,
    standardHeaders: false,
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(
        new AppError({
          statusCode: 429,
          code: "RATE_LIMITED",
          message: messages.RATE_LIMITED,
        }),
      );
    },
  });
}

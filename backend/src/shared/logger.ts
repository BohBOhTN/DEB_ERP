import {
  pino,
  stdSerializers,
  stdTimeFunctions,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";
import type { Response } from "express";

export type { Logger };

/// Field names that must never reach a log line. Request bodies are never
/// logged, but the redaction stays as a second line of defence for any object
/// that is passed through as context.
const redactedPaths = [
  "password",
  "*.password",
  "token",
  "*.token",
  "headers.authorization",
  "headers.cookie",
  "*.headers.authorization",
  "*.headers.cookie",
];

export interface CreateLoggerParams {
  level?: string;
  /// Pretty output is for a developer terminal only; production emits JSON so a
  /// log shipper can index the correlation id.
  pretty?: boolean;
  destination?: DestinationStream;
}

export function createLogger(params: CreateLoggerParams = {}): Logger {
  const options: LoggerOptions = {
    level: params.level ?? "info",
    redact: {
      paths: redactedPaths,
      censor: "[redacted]",
    },
    serializers: {
      err: stdSerializers.err,
    },
    base: undefined,
    timestamp: stdTimeFunctions.isoTime,
  };

  if (params.destination) {
    return pino(options, params.destination);
  }

  if (params.pretty) {
    return pino({
      ...options,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    });
  }

  return pino(options);
}

/// Tests that exercise a middleware or the error handler directly never install
/// a request logger, so they fall back to a silent one rather than crashing.
const fallbackLogger = createLogger({ level: "silent" });

export function getLogger(response: Response): Logger {
  const logger = response.locals.logger as Logger | undefined;
  return logger ?? fallbackLogger;
}

export function setLogger(response: Response, logger: Logger): void {
  response.locals.logger = logger;
}

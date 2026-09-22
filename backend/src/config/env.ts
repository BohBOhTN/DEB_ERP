import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1).default("deb_session"),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(480),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  /// Soft per-client ceiling on every route, generous enough for a busy till.
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),
  /// Number of reverse-proxy hops in front of the API. One for nginx or Caddy;
  /// zero when the API is exposed directly (development).
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  /// Pretty logs are a terminal convenience; production must emit JSON.
  LOG_PRETTY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /// Commit identifier baked into the deployment so the health endpoint can say
  /// which build is running.
  GIT_SHA: z.string().optional(),
  IDEMPOTENCY_TTL_DAYS: z.coerce.number().int().positive().default(7),
  /// Queries at or above this duration are logged as slow.
  SLOW_QUERY_MS: z.coerce.number().int().positive().default(200),
  /// Effective permissions are cached in memory this long; every access
  /// mutation invalidates the cache immediately, so this only bounds staleness
  /// across instances.
  PERMISSION_CACHE_TTL_MS: z.coerce.number().int().positive().default(60000),
  /// A session's last-used timestamp is written at most this often.
  SESSION_TOUCH_INTERVAL_MS: z.coerce.number().int().positive().default(300000),
  /// Milliseconds a request may take before the server closes the socket.
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  /// How long shutdown waits for in-flight requests before forcing exit.
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source = process.env): AppEnv {
  return envSchema.parse(source);
}

export const env = loadEnv();

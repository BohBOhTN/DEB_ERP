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
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source = process.env): AppEnv {
  return envSchema.parse(source);
}

export const env = loadEnv();

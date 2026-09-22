import type { Request, Response } from "express";

export interface SessionCookieConfig {
  name: string;
  secure: boolean;
  maxAgeMs: number;
}

export function readCookie(request: Request, name: string): string | undefined {
  const rawCookie = request.headers.cookie;

  if (!rawCookie) {
    return undefined;
  }

  const cookies = rawCookie.split(";").map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const match = cookies.find((cookie) => cookie.startsWith(prefix));

  if (!match) {
    return undefined;
  }

  return decodeURIComponent(match.slice(prefix.length));
}

export function setSessionCookie(
  response: Response,
  config: SessionCookieConfig,
  sessionToken: string,
): void {
  response.cookie(config.name, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secure,
    maxAge: config.maxAgeMs,
    path: "/",
  });
}

export function clearSessionCookie(
  response: Response,
  config: SessionCookieConfig,
): void {
  response.clearCookie(config.name, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secure,
    path: "/",
  });
}

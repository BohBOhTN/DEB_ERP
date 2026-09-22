import { http } from "msw";
import { makeUser, type SessionUserFixture } from "../../factories/user.js";
import { apiError, apiV1, ok } from "../envelope.js";

/// Session handlers. `authHandlers(user)` signs the given user in;
/// `anonymousHandlers` answers 401 like the real API.
export function authHandlers(user: SessionUserFixture = makeUser()) {
  return [
    http.get(`${apiV1}/auth/me`, () => ok({ user })),
    http.post(`${apiV1}/auth/login`, async ({ request }) => {
      const body = (await request.json()) as {
        email?: string;
        password?: string;
      };

      if (body.password === "wrong-password") {
        return apiError(401, "INVALID_CREDENTIALS", "Identifiants invalides.");
      }

      return ok({ user: { ...user, email: body.email ?? user.email } });
    }),
    http.post(`${apiV1}/auth/logout`, () => ok({ loggedOut: true })),
  ];
}

export const anonymousHandlers = [
  http.get(`${apiV1}/auth/me`, () =>
    apiError(401, "AUTHENTICATION_REQUIRED", "Authentification requise."),
  ),
];

import { useOutletContext } from "react-router-dom";
import type { SessionUser } from "../../lib/auth/session.js";

/// The protected layout publishes the session through the outlet context so
/// pages never re-fetch it.
export interface ProtectedOutletContext {
  user: SessionUser;
}

export function useSessionUser(): SessionUser {
  return useOutletContext<ProtectedOutletContext>().user;
}

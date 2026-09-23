import { createContext, useContext } from "react";
import type { PermissionSet } from "../lib/auth/permissions.js";
import { toPermissionSet } from "../lib/auth/permissions.js";
import type { SessionUser } from "../lib/auth/session.js";

export interface SessionContextValue {
  user: SessionUser;
  permissions: PermissionSet;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSessionContext(): SessionContextValue {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error(
      "useSessionContext must be used inside the protected layout.",
    );
  }

  return value;
}

export function useSessionPermissions(): PermissionSet {
  return useSessionContext().permissions;
}

export function sessionContextFor(user: SessionUser): SessionContextValue {
  return { user, permissions: toPermissionSet(user.effectivePermissions) };
}

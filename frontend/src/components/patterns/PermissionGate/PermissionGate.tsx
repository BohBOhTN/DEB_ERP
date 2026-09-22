import type { ReactNode } from "react";
import {
  hasAll,
  hasAny,
  type PermissionKey,
  type PermissionSet,
} from "../../../lib/auth/permissions.js";

export interface PermissionGateProps {
  permissions: PermissionSet;
  permission?: PermissionKey;
  anyOf?: readonly PermissionKey[];
  allOf?: readonly PermissionKey[];
  fallback?: ReactNode;
  children: ReactNode;
}

/// Hides children the user may not use. Never the only protection: the
/// route guard and the server still enforce the permission (05 section 3.2).
export function PermissionGate({
  permissions,
  permission,
  anyOf,
  allOf,
  fallback = null,
  children,
}: PermissionGateProps) {
  const allowed =
    (permission === undefined || permissions.has(permission)) &&
    (anyOf === undefined || hasAny(permissions, anyOf)) &&
    (allOf === undefined || hasAll(permissions, allOf));

  return <>{allowed ? children : fallback}</>;
}

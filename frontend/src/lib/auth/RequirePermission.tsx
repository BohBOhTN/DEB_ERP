import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ErrorState } from "../../components/ui/ErrorState/ErrorState.js";
import { fr } from "../../i18n/fr.js";
import {
  hasAny,
  type PermissionKey,
  type PermissionSet,
} from "./permissions.js";

export interface RequirePermissionProps {
  permissions: PermissionSet;
  /// Any one of these keys opens the route group.
  anyOf: readonly PermissionKey[];
  children?: ReactNode;
}

/// Route-group guard (06 section 3.7). Denied users see the standard message
/// in place; the server still enforces every permission.
export function RequirePermission({
  permissions,
  anyOf,
  children,
}: RequirePermissionProps) {
  if (!hasAny(permissions, anyOf)) {
    return (
      <ErrorState
        variant="denied"
        title={fr.permissionDeniedTitle}
        description={fr.permissionDeniedDescription}
      />
    );
  }

  return children ? <>{children}</> : <Outlet />;
}

/// Sends an anonymous visitor to the login page and remembers where they
/// were going.
export function RedirectToLogin() {
  const location = useLocation();
  const next = `${location.pathname}${location.search}`;

  return (
    <Navigate
      to={
        next === "/"
          ? "/connexion"
          : `/connexion?next=${encodeURIComponent(next)}`
      }
      replace
    />
  );
}

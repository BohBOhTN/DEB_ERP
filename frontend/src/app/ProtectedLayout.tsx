import { useEffect, useMemo, useState } from "react";
import {
  Navigate,
  Outlet,
  useLocation,
  useMatches,
  useNavigate,
} from "react-router-dom";
import {
  AppShell,
  readCollapsedPreference,
  writeCollapsedPreference,
  type ShellNavItem,
} from "../components/patterns/AppShell/AppShell.js";
import { ErrorState } from "../components/ui/ErrorState/ErrorState.js";
import { useToast } from "../components/ui/Toast/useToast.js";
import { SplashScreen } from "../features/shell/SplashScreen.js";
import { describeError } from "../i18n/errors.js";
import { fr } from "../i18n/fr.js";
import { RedirectToLogin } from "../lib/auth/RequirePermission.js";
import {
  expiryWarningDelayMs,
  useLogout,
  useSession,
} from "../lib/auth/session.js";
import { activeNavItem, visibleNavItems } from "./nav.js";
import { SessionContext, sessionContextFor } from "./sessionContext.js";

interface RouteHandle {
  title?: string;
}

/// Session bootstrap and the shell (UI-06, UI-07). Anonymous visitors go to
/// the login page with `next`; a failed session check shows a retry.
export function ProtectedLayout() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const matches = useMatches();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);

  const handle = (matches[matches.length - 1]?.handle ?? {}) as RouteHandle;
  const active = activeNavItem(location.pathname);
  const title = handle.title ?? active?.label ?? fr.appName;
  const user = session.user;
  const context = useMemo(
    () => (user ? sessionContextFor(user) : null),
    [user],
  );

  const items: ShellNavItem[] = useMemo(
    () =>
      context
        ? visibleNavItems(context.permissions).map((item) => ({
            id: item.id,
            label: item.label,
            icon: <item.icon />,
            href: item.path,
            group: item.group,
            mobilePrimary: item.mobilePrimary,
          }))
        : [],
    [context],
  );

  useEffect(() => {
    document.title = `${title} · ${fr.appName}`;
  }, [title]);

  // OD-V2-005: fixed 8 h session, one warning toast 10 minutes before.
  useEffect(() => {
    const delay = expiryWarningDelayMs(user?.sessionExpiresAt ?? null);

    if (delay === null) {
      return;
    }

    const timer = window.setTimeout(
      () =>
        toast.warning(fr.sessionExpiringTitle, fr.sessionExpiringDescription),
      delay,
    );

    return () => window.clearTimeout(timer);
  }, [user?.sessionExpiresAt, toast]);

  if (session.status === "loading") {
    return <SplashScreen />;
  }

  if (session.status === "error") {
    const copy = describeError(session.error);

    return (
      <ErrorState
        variant="network"
        title={copy.title}
        description={copy.description}
        onRetry={session.refetch}
      />
    );
  }

  if (!user || !context) {
    // A deliberate sign-out lands on the login page without a `next`; an
    // expired session keeps the destination for after the next login.
    return logout.isPending || logout.isSuccess ? (
      <Navigate to="/connexion" replace />
    ) : (
      <RedirectToLogin />
    );
  }

  return (
    <SessionContext.Provider value={context}>
      <AppShell
        items={items}
        activeId={active?.id}
        title={title}
        user={{
          displayName: user.displayName,
          roleNames: user.roles.map((role) => role.name),
        }}
        onNavigate={(item) => navigate(item.href)}
        onLogout={() => logout.mutate()}
        onSettings={() => navigate("/parametres")}
        collapsed={collapsed}
        onCollapsedChange={(next) => {
          setCollapsed(next);
          writeCollapsedPreference(next);
        }}
      >
        <Outlet context={{ user }} />
      </AppShell>
    </SessionContext.Provider>
  );
}

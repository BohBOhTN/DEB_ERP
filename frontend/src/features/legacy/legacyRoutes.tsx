import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { PermissionKey } from "../../lib/auth/permissions.js";
import type { CurrentUser } from "../auth/authApi";

type Screen = LazyExoticComponent<ComponentType<{ user: CurrentUser }>>;

const lazyScreen = <TModule extends Record<string, unknown>>(
  loader: () => Promise<TModule>,
  name: keyof TModule & string,
): Screen =>
  lazy(async () => {
    const module = await loader();

    return { default: module[name] as ComponentType<{ user: CurrentUser }> };
  });

const access = lazyScreen(
  () => import("../access/AccessManagement"),
  "AccessManagement",
);
const audit = lazyScreen(
  () => import("../audit/AuditManagement"),
  "AuditManagement",
);

export interface LegacyRoute {
  path: string;
  screen: Screen;
  anyOf: readonly PermissionKey[];
  title: string;
}

/// The V1 screens not yet rebuilt, at their new French paths (06 section
/// 3.7, 07 section 2). Catalogue and stock left this table in Sprint 20.
export const legacyRoutes: readonly LegacyRoute[] = [
  {
    path: "/utilisateurs",
    screen: access,
    anyOf: ["users.view"],
    title: "Utilisateurs",
  },
  {
    path: "/roles",
    screen: access,
    anyOf: ["roles.view"],
    title: "Rôles et autorisations",
  },
  {
    path: "/audit",
    screen: audit,
    anyOf: ["audit.view"],
    title: "Journal d'audit",
  },
];

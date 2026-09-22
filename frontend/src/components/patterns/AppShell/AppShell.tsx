import {
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  MoreHorizontal,
  Settings,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { useIsDesktop, useIsPhone } from "../../../lib/hooks/useBreakpoint.js";
import { fr } from "../../../i18n/fr.js";
import { Avatar } from "../../ui/Avatar/Avatar.js";
import { DropdownMenu } from "../../ui/DropdownMenu/DropdownMenu.js";
import { IconButton } from "../../ui/IconButton/IconButton.js";
import { Sheet } from "../../ui/Sheet/Sheet.js";
import styles from "./AppShell.module.css";

export interface ShellNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  /// Group heading in the sidebar; items without one sit at the top.
  group?: string;
  /// One of the four phone bottom-nav destinations (OD-V2-009).
  mobilePrimary?: boolean;
}

export interface ShellUser {
  displayName: string;
  roleNames: string[];
}

export interface AppShellProps {
  /// Already filtered by permission: the shell never decides visibility.
  items: ShellNavItem[];
  activeId?: string;
  user: ShellUser;
  /// Page title for the phone top bar; breadcrumbs slot for desktop.
  title?: string;
  breadcrumbs?: ReactNode;
  /// "Ancienne interface" badge while a V1 screen is mounted.
  badge?: ReactNode;
  onNavigate?: (item: ShellNavItem) => void;
  onLogout?: () => void;
  onSettings?: () => void;
  logoSrc?: string;
  /// Persisted collapsed state of the desktop rail.
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
}

const collapsedStorageKey = "deb.shell.collapsed";

export function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(collapsedStorageKey) === "1";
  } catch {
    return false;
  }
}

export function writeCollapsedPreference(collapsed: boolean): void {
  try {
    localStorage.setItem(collapsedStorageKey, collapsed ? "1" : "0");
  } catch {
    // Storage may be unavailable; the preference is a convenience only.
  }
}

/// Sidebar, top bar, bottom navigation and the content outlet (05 section
/// 3.2, 07 section 2). Static in Sprint 18: the router wires it in Sprint 19.
export function AppShell({
  items,
  activeId,
  user,
  title,
  breadcrumbs,
  badge,
  onNavigate,
  onLogout,
  onSettings,
  logoSrc = "/assets/dar-el-barka-logo.png",
  collapsed = false,
  onCollapsedChange,
  children,
}: AppShellProps) {
  const isDesktop = useIsDesktop();
  const isPhone = useIsPhone();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const groups = groupItems(items);
  const primary = items.filter((item) => item.mobilePrimary).slice(0, 4);
  const secondary = items.filter((item) => !primary.includes(item));

  const navigate = (item: ShellNavItem) => {
    setDrawerOpen(false);
    setMoreOpen(false);
    onNavigate?.(item);
  };

  const navList = (dense: boolean) => (
    <nav
      className={cx(styles.nav, dense && styles.navDense)}
      aria-label={fr.mainMenu}
    >
      {groups.map((group) => (
        <div key={group.label ?? "root"} className={styles.group}>
          {group.label && !dense ? (
            <p className={cx("eyebrow", styles.groupLabel)}>{group.label}</p>
          ) : null}
          <ul>
            {group.items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  className={cx(
                    styles.navItem,
                    item.id === activeId && styles.navActive,
                  )}
                  aria-current={item.id === activeId ? "page" : undefined}
                  title={dense ? item.label : undefined}
                  onClick={(event) => {
                    if (onNavigate) {
                      event.preventDefault();
                      navigate(item);
                    }
                  }}
                >
                  <span className={styles.navIcon} aria-hidden="true">
                    {item.icon}
                  </span>
                  <span
                    className={cx(styles.navLabel, dense && "visually-hidden")}
                  >
                    {item.label}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (dense: boolean) => (
    <div className={styles.brand}>
      <img
        src={logoSrc}
        alt=""
        width={40}
        height={40}
        className={styles.logo}
      />
      {dense ? (
        <span className="visually-hidden">{fr.appName}</span>
      ) : (
        <span className={styles.wordmark}>{fr.appName}</span>
      )}
    </div>
  );

  const userMenu = (
    <DropdownMenu
      label={fr.userMenu}
      trigger={
        <button
          type="button"
          className={styles.userButton}
          aria-label={`${fr.userMenu} : ${user.displayName}`}
        >
          <Avatar name={user.displayName} size="sm" />
          {!isPhone ? (
            <span className={styles.userText}>
              <span className={styles.userName}>{user.displayName}</span>
              <span className={styles.userRole}>
                {user.roleNames.join(", ")}
              </span>
            </span>
          ) : null}
        </button>
      }
      items={[
        {
          id: "settings",
          label: fr.settings,
          icon: <Settings />,
          onSelect: onSettings,
          disabled: !onSettings,
        },
        {
          id: "logout",
          label: fr.logOut,
          icon: <LogOut />,
          onSelect: onLogout,
          separatorBefore: true,
        },
      ]}
    />
  );

  return (
    <div
      className={cx(styles.root, isDesktop && collapsed && styles.collapsed)}
    >
      <a href="#main" className={cx(styles.skip, "visually-hidden")}>
        {fr.skipToContent}
      </a>
      {isDesktop ? (
        <aside className={styles.sidebar} aria-label={fr.navigation}>
          {brand(collapsed)}
          {navList(collapsed)}
          <div className={styles.sidebarFooter}>
            <IconButton
              label={collapsed ? fr.expandSidebar : fr.collapseSidebar}
              icon={collapsed ? <ChevronsRight /> : <ChevronsLeft />}
              size="sm"
              onClick={() => onCollapsedChange?.(!collapsed)}
            />
          </div>
        </aside>
      ) : null}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            {!isDesktop ? (
              <IconButton
                label={fr.openNavigation}
                icon={<Menu />}
                onClick={() => setDrawerOpen(true)}
              />
            ) : null}
            {isDesktop ? (
              (breadcrumbs ?? (
                <span className={styles.topbarTitle}>{title}</span>
              ))
            ) : (
              <span className={styles.topbarTitle}>{title}</span>
            )}
            {badge}
          </div>
          <div className={styles.topbarRight}>{userMenu}</div>
        </header>
        <main id="main" className={styles.content} tabIndex={-1}>
          {children}
        </main>
      </div>
      {!isDesktop ? (
        <Sheet
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          side="right"
          title={fr.navigation}
        >
          {brand(false)}
          {navList(false)}
        </Sheet>
      ) : null}
      {isPhone ? (
        <nav className={styles.bottomNav} aria-label={fr.navigation}>
          {primary.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className={cx(
                styles.bottomItem,
                item.id === activeId && styles.bottomActive,
              )}
              aria-current={item.id === activeId ? "page" : undefined}
              onClick={(event) => {
                if (onNavigate) {
                  event.preventDefault();
                  navigate(item);
                }
              }}
            >
              <span className={styles.bottomIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span className={styles.bottomLabel}>{item.label}</span>
            </a>
          ))}
          {secondary.length > 0 ? (
            <button
              type="button"
              className={styles.bottomItem}
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
            >
              <span className={styles.bottomIcon} aria-hidden="true">
                <MoreHorizontal />
              </span>
              <span className={styles.bottomLabel}>{fr.more}</span>
            </button>
          ) : null}
          <Sheet
            open={moreOpen}
            onOpenChange={setMoreOpen}
            side="bottom"
            title={fr.more}
          >
            <nav aria-label={fr.more}>
              {groupItems(secondary).map((group) => (
                <div key={group.label ?? "root"} className={styles.group}>
                  {group.label ? (
                    <p className={cx("eyebrow", styles.groupLabel)}>
                      {group.label}
                    </p>
                  ) : null}
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <a
                          href={item.href}
                          className={styles.navItem}
                          onClick={(event) => {
                            if (onNavigate) {
                              event.preventDefault();
                              navigate(item);
                            }
                          }}
                        >
                          <span className={styles.navIcon} aria-hidden="true">
                            {item.icon}
                          </span>
                          <span className={styles.navLabel}>{item.label}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </Sheet>
        </nav>
      ) : null}
      <span className={styles.closeIconHolder} hidden>
        <X />
      </span>
    </div>
  );
}

function groupItems(
  items: ShellNavItem[],
): Array<{ label: string | undefined; items: ShellNavItem[] }> {
  const groups: Array<{ label: string | undefined; items: ShellNavItem[] }> =
    [];

  for (const item of items) {
    const existing = groups.find((group) => group.label === item.group);

    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ label: item.group, items: [item] });
    }
  }

  return groups;
}

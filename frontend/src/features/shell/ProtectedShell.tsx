import { useMemo, useState } from "react";
import { AccessManagement } from "../access/AccessManagement";
import { logout, type CurrentUser } from "../auth/authApi";
import { CatalogManagement } from "../catalog/CatalogManagement";

interface ProtectedShellProps {
  user: CurrentUser;
  onLogout: () => void;
}

export function ProtectedShell({ user, onLogout }: ProtectedShellProps) {
  const modules = useMemo(() => buildNavigation(user), [user]);
  const [activeModule, setActiveModule] = useState(modules[0]?.id ?? "home");

  async function handleLogout() {
    await logout();
    onLogout();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img
            alt="Logo Dar El Barka"
            className="brand-logo"
            src="/assets/dar-el-barka-logo.png"
          />
          <div>
            <p className="eyebrow">Session active</p>
            <h1>Dar El Barka</h1>
          </div>
        </div>
        <button
          className="secondary-button"
          onClick={handleLogout}
          type="button"
        >
          Se deconnecter
        </button>
      </header>

      <nav className="module-nav" aria-label="Modules">
        {modules.map((module) => (
          <button
            aria-pressed={activeModule === module.id}
            className="module-button"
            key={module.id}
            onClick={() => setActiveModule(module.id)}
            type="button"
          >
            {module.label}
          </button>
        ))}
      </nav>

      <main className="workspace">
        {activeModule === "catalog" ? (
          <CatalogManagement user={user} />
        ) : activeModule === "access" ? (
          <AccessManagement user={user} />
        ) : (
          <section className="status-panel" aria-labelledby="dashboard-title">
            <h2 id="dashboard-title">Tableau de bord</h2>
            <dl>
              <div>
                <dt>Utilisateur</dt>
                <dd>{user.displayName}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Autorisations</dt>
                <dd>{user.effectivePermissions.length}</dd>
              </div>
            </dl>
          </section>
        )}
      </main>
    </div>
  );
}

function buildNavigation(user: CurrentUser) {
  const modules = [{ id: "home", label: "Tableau de bord" }];

  if (
    user.effectivePermissions.includes("roles.view") ||
    user.effectivePermissions.includes("users.view")
  ) {
    modules.push({ id: "access", label: "Acces" });
  }

  if (
    user.effectivePermissions.includes("products.view") ||
    user.effectivePermissions.includes("raw_materials.view") ||
    user.effectivePermissions.includes("categories.view") ||
    user.effectivePermissions.includes("units.view")
  ) {
    modules.push({ id: "catalog", label: "Catalogue" });
  }

  return modules;
}

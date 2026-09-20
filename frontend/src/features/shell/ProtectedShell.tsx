import { logout, type CurrentUser } from "../auth/authApi";

interface ProtectedShellProps {
  user: CurrentUser;
  onLogout: () => void;
}

export function ProtectedShell({ user, onLogout }: ProtectedShellProps) {
  async function handleLogout() {
    await logout();
    onLogout();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Session active</p>
          <h1>Dar El Barka</h1>
        </div>
        <button
          className="secondary-button"
          onClick={handleLogout}
          type="button"
        >
          Se deconnecter
        </button>
      </header>

      <main className="workspace">
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
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { getCurrentUser, type CurrentUser } from "../features/auth/authApi";
import { LoginForm } from "../features/auth/LoginForm";
import { ProtectedShell } from "../features/shell/ProtectedShell";

type LoadState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: CurrentUser };

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let isMounted = true;

    getCurrentUser()
      .then((user) => {
        if (isMounted) {
          setState({ status: "authenticated", user });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState({ status: "anonymous" });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <main className="auth-layout" aria-live="polite">
        <p>Chargement de la session...</p>
      </main>
    );
  }

  if (state.status === "authenticated") {
    return (
      <ProtectedShell
        onLogout={() => setState({ status: "anonymous" })}
        user={state.user}
      />
    );
  }

  return (
    <main className="auth-layout">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">Acces securise</p>
        <h1 id="login-title">Dar El Barka</h1>
        <p className="summary">
          Connectez-vous pour acceder a votre espace de travail.
        </p>
        <LoginForm
          onAuthenticated={(user) =>
            setState({ status: "authenticated", user })
          }
        />
      </section>
    </main>
  );
}

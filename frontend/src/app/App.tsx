import { useEffect, useState } from "react";
import { fetchHealth, type HealthEnvelope } from "../services/health";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; health: HealthEnvelope }
  | { status: "error" };

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let isMounted = true;

    fetchHealth()
      .then((health) => {
        if (isMounted) {
          setState({ status: "ready", health });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState({ status: "error" });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="shell">
      <section className="intro" aria-labelledby="app-title">
        <p className="eyebrow">Fondation R0</p>
        <h1 id="app-title">Dar El Barka</h1>
        <p className="summary">
          Base technique prete pour construire la gestion de la boulangerie.
        </p>
      </section>

      <section className="status-panel" aria-live="polite">
        <h2>Etat du systeme</h2>
        {state.status === "loading" ? <p>Verification en cours...</p> : null}
        {state.status === "error" ? (
          <p role="alert">
            Impossible de joindre l'API. Verifiez que le serveur backend est
            demarre.
          </p>
        ) : null}
        {state.status === "ready" ? (
          <dl>
            <div>
              <dt>API</dt>
              <dd>
                {state.health.data.status === "ok" ? "Disponible" : "Limitee"}
              </dd>
            </div>
            <div>
              <dt>Base de donnees</dt>
              <dd>
                {state.health.data.database.status === "ok"
                  ? "Connectee"
                  : "Indisponible"}
              </dd>
            </div>
            <div>
              <dt>Environnement</dt>
              <dd>{state.health.data.environment}</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </main>
  );
}

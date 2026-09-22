import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "../auth/authApi";
import {
  getAuditEvents,
  getAuditFilters,
  type AuditEvent,
  type AuditFilters,
} from "./auditApi";

interface AuditManagementProps {
  user: CurrentUser;
}

export function AuditManagement({ user }: AuditManagementProps) {
  const canView = useMemo(
    () => user.effectivePermissions.includes("audit.view"),
    [user.effectivePermissions],
  );

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState<AuditFilters>({
    actions: [],
    entities: [],
  });
  const [query, setQuery] = useState({
    action: "",
    entity: "",
    correlationId: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void refresh();
  }, [page, canView]);

  async function refresh() {
    if (!canView) {
      setIsLoading(false);
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const [eventPage, filterOptions] = await Promise.all([
        getAuditEvents({ ...query, page }),
        getAuditFilters(),
      ]);
      setEvents(eventPage.items);
      setPageCount(eventPage.pageCount);
      setTotal(eventPage.total);
      setFilters(filterOptions);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (page === 1) {
      await refresh();
      return;
    }

    // Resetting the page triggers the effect, which reloads with the filters.
    setPage(1);
  }

  if (!canView) {
    return (
      <section className="audit-workspace" aria-labelledby="audit-title">
        <h2 id="audit-title">Journal d'audit</h2>
        <p className="status-muted">
          Vous n'avez pas l'autorisation de consulter le journal d'audit.
        </p>
      </section>
    );
  }

  return (
    <section className="audit-workspace" aria-labelledby="audit-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Audit</p>
          <h2 id="audit-title">Journal d'audit</h2>
        </div>
        <span className="permission-count">{total}</span>
      </div>

      {error ? <p role="alert">{error}</p> : null}

      <div className="panel">
        <form className="inline-form" onSubmit={handleSearch}>
          <label className="field">
            Action
            <select
              onChange={(event) =>
                setQuery({ ...query, action: event.target.value })
              }
              value={query.action}
            >
              <option value="">Toutes les actions</option>
              {filters.actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Entite
            <select
              onChange={(event) =>
                setQuery({ ...query, entity: event.target.value })
              }
              value={query.entity}
            >
              <option value="">Toutes les entites</option>
              {filters.entities.map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Du
            <input
              onChange={(event) =>
                setQuery({ ...query, from: event.target.value })
              }
              type="date"
              value={query.from}
            />
          </label>
          <label className="field">
            Au
            <input
              onChange={(event) =>
                setQuery({ ...query, to: event.target.value })
              }
              type="date"
              value={query.to}
            />
          </label>
          <label className="field">
            Identifiant de correlation
            <input
              onChange={(event) =>
                setQuery({ ...query, correlationId: event.target.value })
              }
              placeholder="Tracer une operation precise"
              value={query.correlationId}
            />
          </label>
          <button className="secondary-button" type="submit">
            Filtrer
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h3>Evenements</h3>
          <span>{total}</span>
        </div>

        {isLoading ? (
          <p className="status-muted">Chargement du journal...</p>
        ) : events.length === 0 ? (
          <p className="status-muted">
            Aucun evenement pour ces filtres. Elargissez la periode ou retirez
            un filtre pour voir l'historique.
          </p>
        ) : (
          <ul className="record-list">
            {events.map((event) => (
              <li className="expense-row" key={event.id}>
                <div className="metric-row">
                  <span>
                    {event.action}
                    <small>
                      {event.entity}
                      {event.targetId ? ` · ${event.targetId}` : ""}
                      {event.reason ? ` · ${event.reason}` : ""}
                    </small>
                  </span>
                  <strong>{formatDateTime(event.createdAt)}</strong>
                </div>
                <p className="record-meta">
                  {event.actor
                    ? `${event.actor.displayName} (${event.actor.email})`
                    : "Systeme"}
                  {event.correlationId ? ` · ${event.correlationId}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}

        {pageCount > 1 ? (
          <div className="filter-row">
            <button
              className="chip-button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              type="button"
            >
              Precedent
            </button>
            <span className="record-meta">
              Page {page} sur {pageCount}
            </span>
            <button
              className="chip-button"
              disabled={page >= pageCount}
              onClick={() => setPage(page + 1)}
              type="button"
            >
              Suivant
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Africa/Tunis",
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operation impossible.";
}

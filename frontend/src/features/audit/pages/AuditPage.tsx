import { useState } from "react";
import { Link } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PeriodFilter } from "../../../components/patterns/PeriodFilter/PeriodFilter.js";
import {
  periodFromParams,
  periodRange,
  periodToParams,
} from "../../../lib/dates/periodRange.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { formatDateTime } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import type { AuditEvent } from "../audit.api.js";
import { useAuditEvents, useAuditFilters } from "../audit.queries.js";
import { AuditEventSheet } from "../components/AuditEventSheet.js";
import { auditTargetHref } from "../components/auditLinks.js";
import styles from "./AuditPage.module.css";

const defaults = {
  action: "",
  entity: "",
  correlationId: "",
  period: "today",
  from: "",
  to: "",
  page: 1,
  pageSize: 25,
};

/// `/audit` (UI-20): the journal with French labels, filters in the URL and
/// a sheet per event with the before and after.
export function AuditPage() {
  const [state, setState] = useUrlState(defaults);
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const filters = useAuditFilters();
  const period = periodFromParams(state, "today");
  const range = periodRange(period);
  const query = useAuditEvents({
    page: state.page,
    pageSize: state.pageSize,
    sort: { field: "createdAt", direction: "desc" },
    action: state.action || undefined,
    entity: state.entity || undefined,
    correlationId: state.correlationId || undefined,
    from: range.from || undefined,
    to: range.to || undefined,
  });
  const activeCount =
    (state.action ? 1 : 0) +
    (state.entity ? 1 : 0) +
    (state.correlationId ? 1 : 0) +
    (period.preset !== "today" ? 1 : 0);

  const columns: DataTableColumn<AuditEvent>[] = [
    {
      id: "at",
      header: "Date et heure",
      accessorFn: (row) => formatDateTime(row.createdAt),
    },
    { id: "action", header: "Action", accessorFn: (row) => row.actionLabelFr },
    { id: "entity", header: "Entité", accessorFn: (row) => row.entityLabelFr },
    {
      id: "target",
      header: "Cible",
      cell: ({ row }) => {
        const href = auditTargetHref(
          row.original.entity,
          row.original.targetId,
        );
        return href ? (
          <Link to={href} onClick={(event) => event.stopPropagation()}>
            {row.original.entityLabelFr}
          </Link>
        ) : (
          <span className={styles.muted}>—</span>
        );
      },
    },
    {
      id: "actor",
      header: "Acteur",
      accessorFn: (row) => row.actor?.displayName ?? "Système",
    },
    { id: "reason", header: "Raison", accessorFn: (row) => row.reason ?? "—" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Journal d'audit"
        description="Qui a fait quoi, quand, avec les valeurs avant et après."
      />
      <PeriodFilter
        value={period}
        onChange={(next) => setState({ ...periodToParams(next), page: 1 })}
      />
      <FilterBar
        activeCount={activeCount}
        onReset={() =>
          setState({
            action: "",
            entity: "",
            correlationId: "",
            period: "today",
            from: "",
            to: "",
            page: 1,
          })
        }
        filters={
          <>
            <Select
              aria-label="Action"
              placeholder="Toutes les actions"
              clearable
              value={state.action || null}
              onValueChange={(value) =>
                setState({ action: value ?? "", page: 1 })
              }
              options={(filters.data?.actionOptions ?? []).map((option) => ({
                value: option.value,
                label: option.labelFr,
              }))}
            />
            <Select
              aria-label="Entité"
              placeholder="Toutes les entités"
              clearable
              value={state.entity || null}
              onValueChange={(value) =>
                setState({ entity: value ?? "", page: 1 })
              }
              options={(filters.data?.entityOptions ?? []).map((option) => ({
                value: option.value,
                label: option.labelFr,
              }))}
            />
            <TextInput
              aria-label="Identifiant de corrélation"
              placeholder="Identifiant de corrélation"
              value={state.correlationId}
              onChange={(event) =>
                setState({ correlationId: event.target.value, page: 1 })
              }
            />
          </>
        }
      />
      <DataTable<AuditEvent>
        label="Journal d'audit"
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={state.page}
        pageSize={state.pageSize}
        onChange={(change) =>
          setState({
            ...(change.page ? { page: change.page } : {}),
            ...(change.pageSize ? { pageSize: change.pageSize } : {}),
          })
        }
        loading={query.isPending || query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          title: "Aucun événement",
          description:
            activeCount > 0
              ? "Modifiez les filtres."
              : "Les actions des utilisateurs apparaîtront ici.",
        }}
        getRowId={(row) => row.id}
        onRowClick={(row) => setOpen(row)}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.actionLabelFr}</strong>
              <span className={styles.muted}>
                {formatDateTime(row.createdAt)}
              </span>
            </span>
            <span className={styles.muted}>
              {row.entityLabelFr} · {row.actor?.displayName ?? "Système"}
              {row.reason ? ` · ${row.reason}` : ""}
            </span>
          </>
        )}
      />
      <AuditEventSheet event={open} onClose={() => setOpen(null)} />
    </>
  );
}

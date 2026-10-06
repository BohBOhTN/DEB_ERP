import { Plus } from "lucide-react";
import { Fragment } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { PeriodFilter } from "../../../components/patterns/PeriodFilter/PeriodFilter.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { Tabs } from "../../../components/ui/Tabs/Tabs.js";
import { useMediaQuery } from "../../../lib/hooks/useMediaQuery.js";
import {
  formatDate,
  formatDateLong,
  formatMoney,
  formatTime,
  toBusinessDate,
} from "../../../i18n/format.js";
import {
  periodFromParams,
  periodRange,
  periodToParams,
} from "../../../lib/dates/periodRange.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import { CustomerCombobox } from "../../customers/components/CustomerCombobox.js";
import type { Order } from "../orders.api.js";
import { useOrders, useOrdersSummary } from "../orders.queries.js";
import {
  boardQuery,
  boards,
  closedBoards,
  defaultPeriod,
  dueLabel,
  isLate,
  presetsFor,
  windowOf,
  type Board,
} from "../ordersBoard.js";
import { OrderRowActions } from "../components/OrderRowActions.js";
import { openOrderStatuses, remainingOf } from "../components/orderLabels.js";
import styles from "./OrderPages.module.css";

const defaults = {
  board: "todo",
  q: "",
  customerId: "",
  customerName: "",
  period: defaultPeriod as string,
  from: "",
  to: "",
  page: 1,
  pageSize: 25,
};

/// `/commandes` (UI-14): a status board over the queue, a table on desktop
/// and day-grouped cards on phones, soonest due first.
export function OrdersPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const phone = useMediaQuery("(max-width: 599px)");
  const [state, setState] = useUrlState(defaults);
  const board = (
    boards.some((item) => item.value === state.board) ? state.board : "todo"
  ) as Board;
  const presets = presetsFor(board);
  const stored = periodFromParams(state, defaultPeriod);
  // A window the tab does not offer (a link, or a tab change) falls back
  // to every date instead of filtering by something the user cannot see.
  const period = presets.includes(stored.preset)
    ? stored
    : { preset: defaultPeriod, from: "", to: "" };
  const range = periodRange(period);
  const scope = {
    customerId: state.customerId || undefined,
    q: state.q || undefined,
  };
  const query = useOrders({
    page: state.page,
    pageSize: state.pageSize,
    sort: {
      field: "requestedFulfillmentAt",
      direction:
        closedBoards.includes(board) || board === "all" ? "desc" : "asc",
    },
    ...scope,
    ...boardQuery(board, range),
  });
  // The KPI row follows the customer, the search and the period, not the
  // tab: it describes the whole queue the user is looking at.
  const summary = useOrdersSummary({
    ...scope,
    ...(board === "overdue" ? {} : windowOf(range)),
  });
  const rows = query.data?.items ?? [];
  const activeCount =
    (state.customerId ? 1 : 0) +
    (state.q ? 1 : 0) +
    (period.preset !== defaultPeriod ? 1 : 0);
  const count = (value: number | undefined) => value ?? 0;

  const columns: DataTableColumn<Order>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference,
    },
    {
      id: "customer",
      header: "Client",
      accessorFn: (row) => row.customer.name,
    },
    {
      id: "for",
      header: "Pour le",
      meta: { sortField: "requestedFulfillmentAt" },
      cell: ({ row }) => (
        <span className={styles.nameCell}>
          <span>
            {formatDate(row.original.requestedFulfillmentAt)}{" "}
            {formatTime(row.original.requestedFulfillmentAt)}
          </span>
          {isLate(row.original) ? (
            <Badge tone="danger">
              {`En retard · ${dueLabel(row.original.requestedFulfillmentAt)}`}
            </Badge>
          ) : openOrderStatuses.includes(row.original.status) ? (
            <span className={styles.muted}>
              {dueLabel(row.original.requestedFulfillmentAt)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "lines",
      header: "Lignes",
      meta: { align: "right" },
      accessorFn: (row) => row._count?.lines ?? row.lines?.length ?? 0,
    },
    {
      id: "total",
      header: "Total",
      meta: { align: "right", sortField: "totalTnd" },
      accessorFn: (row) => formatMoney(row.totalTnd),
    },
    {
      id: "advance",
      header: "Avance",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.advanceReceivedTnd),
    },
    {
      id: "remaining",
      header: "Reste",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(remainingOf(row)),
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => <StatusPill status={row.original.status} />,
    },
  ];

  const groups = rows.reduce<Array<{ day: string; orders: Order[] }>>(
    (acc, order) => {
      const day = toBusinessDate(order.requestedFulfillmentAt);
      const group = acc.find((candidate) => candidate.day === day);
      if (group) group.orders.push(order);
      else acc.push({ day, orders: [order] });
      return acc;
    },
    [],
  );

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title="Commandes"
        description="La file des commandes clients, de la plus urgente à la plus lointaine."
        actions={
          <PermissionGate permissions={permissions} permission="orders.create">
            <Button
              leftIcon={<Plus />}
              onClick={() => navigate("/commandes/nouvelle")}
            >
              Nouvelle commande
            </Button>
          </PermissionGate>
        }
      />
      <KpiGrid columns={4}>
        <KpiTile
          label="Commandes ouvertes"
          value={count(summary.data?.openCount)}
          note={`${count(summary.data?.dueTodayCount)} à livrer aujourd'hui`}
          loading={summary.isPending}
          featured
        />
        <KpiTile
          label="En retard"
          value={count(summary.data?.overdueCount)}
          note={`${count(summary.data?.readyCount)} prête${count(summary.data?.readyCount) > 1 ? "s" : ""}`}
          loading={summary.isPending}
        />
        <KpiTile
          label="Acomptes reçus"
          value={formatMoney(summary.data?.advanceHeldTnd ?? "0")}
          note={`sur ${formatMoney(summary.data?.openTotalTnd ?? "0")} de commandes ouvertes`}
          loading={summary.isPending}
        />
        <KpiTile
          label="Reste à encaisser"
          value={formatMoney(summary.data?.remainingTnd ?? "0")}
          note={`${count(summary.data?.completedCount)} terminée${count(summary.data?.completedCount) > 1 ? "s" : ""} pour ${formatMoney(summary.data?.completedTotalTnd ?? "0")}`}
          loading={summary.isPending}
        />
      </KpiGrid>
      <Tabs<Board>
        label="File des commandes"
        value={board}
        onValueChange={(next) =>
          setState({
            board: next,
            page: 1,
            // A window the next tab does not offer is dropped for good, so
            // it does not come back two tabs later.
            ...(presetsFor(next).includes(period.preset)
              ? {}
              : periodToParams({ preset: defaultPeriod, from: "", to: "" })),
          })
        }
        items={boards.map((item) => ({
          value: item.value,
          label: item.label,
          content: null,
        }))}
      />
      {board !== "overdue" ? (
        <PeriodFilter
          label="Retrait"
          presets={presets}
          value={period}
          onChange={(next) => setState({ ...periodToParams(next), page: 1 })}
        />
      ) : (
        <p className={styles.muted}>Toutes les commandes en retard.</p>
      )}
      <FilterBar
        search={state.q}
        onSearchChange={(q) => setState({ q, page: 1 })}
        searchPlaceholder="Référence ou client"
        activeCount={activeCount}
        onReset={() =>
          setState({
            q: "",
            customerId: "",
            customerName: "",
            period: defaultPeriod,
            from: "",
            to: "",
            page: 1,
          })
        }
        filters={
          <>
            <CustomerCombobox
              aria-label="Client"
              placeholder="Tous les clients"
              value={
                state.customerId
                  ? {
                      value: state.customerId,
                      label: state.customerName || "Client",
                    }
                  : null
              }
              onChange={(option) =>
                setState({
                  customerId: option?.value ?? "",
                  customerName: option?.label ?? "",
                  page: 1,
                })
              }
            />
          </>
        }
      />
      {phone ? (
        query.isPending ? (
          <Skeleton variant="table" rows={4} />
        ) : groups.length === 0 ? (
          <EmptyState
            title="Aucune commande"
            description="Rien dans cette file pour le moment."
          />
        ) : (
          groups.map((group) => (
            <Fragment key={group.day}>
              <h2 className={styles.dayHeader}>{formatDateLong(group.day)}</h2>
              <div className={styles.dayGroup}>
                {group.orders.map((order) => (
                  <Card key={order.id}>
                    <Link
                      to={`/commandes/${order.id}`}
                      className={styles.cardTop}
                    >
                      <strong>{order.customer.name}</strong>
                      <span className="tabular-nums">
                        {formatMoney(order.totalTnd)}
                      </span>
                    </Link>
                    <span className={styles.muted}>
                      {order.reference} ·{" "}
                      {formatTime(order.requestedFulfillmentAt)}
                      {openOrderStatuses.includes(order.status)
                        ? ` · ${dueLabel(order.requestedFulfillmentAt)}`
                        : ""}
                      {` · reste ${formatMoney(remainingOf(order))}`}
                    </span>
                    <span className={styles.cardTop}>
                      <span className={styles.nameCell}>
                        <StatusPill status={order.status} />
                        {isLate(order) ? (
                          <Badge tone="danger">En retard</Badge>
                        ) : null}
                      </span>
                      <OrderRowActions
                        order={order}
                        permissions={permissions}
                      />
                    </span>
                  </Card>
                ))}
              </div>
            </Fragment>
          ))
        )
      ) : (
        <DataTable<Order>
          label="Commandes"
          columns={columns}
          data={rows}
          total={query.data?.total ?? 0}
          page={state.page}
          pageSize={state.pageSize}
          onChange={(change) =>
            setState({
              ...(change.page ? { page: change.page } : {}),
              ...(change.pageSize ? { pageSize: change.pageSize } : {}),
            })
          }
          // Not while refetching: the rows stay in place after an action
          // instead of blinking into a skeleton.
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={{
            title: "Aucune commande",
            description: "Rien dans cette file pour le moment.",
          }}
          getRowId={(row) => row.id}
          onRowClick={(row) => navigate(`/commandes/${row.id}`)}
          rowActions={(row) => (
            <OrderRowActions order={row} permissions={permissions} />
          )}
        />
      )}
    </>
  );
}

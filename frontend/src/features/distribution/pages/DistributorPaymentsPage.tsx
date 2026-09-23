import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { formatDate, formatMoney } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type {
  DistributorBalanceRow,
  DistributorPayment,
} from "../distribution.api.js";
import {
  useDistributorBalances,
  useDistributorPayments,
} from "../distribution.queries.js";
import { DistributorPaymentDialog } from "../components/DistributorPaymentDialog.js";
import styles from "./DistributionPages.module.css";

const defaults = { q: "", page: 1, pageSize: 25, paymentsPage: 1 };

/// `/distribution/reglements` (UI-16): the balances with the last payment
/// date, the payment history, and the payment dialog with allocations.
export function DistributorPaymentsPage() {
  const permissions = useSessionPermissions();
  const [state, setState] = useUrlState(defaults);
  const [creating, setCreating] = useState(false);
  const balances = useDistributorBalances({
    page: state.page,
    pageSize: state.pageSize,
    q: state.q || undefined,
    sort: "balance",
  });
  const payments = useDistributorPayments({
    page: state.paymentsPage,
    pageSize: 10,
    sort: { field: "paidAt", direction: "desc" },
  });

  const balanceColumns: DataTableColumn<DistributorBalanceRow>[] = [
    {
      id: "name",
      header: "Distributeur",
      cell: ({ row }) => (
        <Link to={`/distributeurs/${row.original.distributor.id}`}>
          {row.original.distributor.name}
        </Link>
      ),
    },
    {
      id: "balance",
      header: "Solde dû",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span
          className={
            Number(row.original.balanceTnd) > 0 ? styles.due : undefined
          }
        >
          {formatMoney(row.original.balanceTnd)}
        </span>
      ),
    },
    {
      id: "last",
      header: "Dernier paiement",
      accessorFn: (row) =>
        row.lastPaymentAt ? formatDate(row.lastPaymentAt) : "Aucun",
    },
  ];
  const paymentColumns: DataTableColumn<DistributorPayment>[] = [
    { id: "date", header: "Date", accessorFn: (row) => formatDate(row.paidAt) },
    {
      id: "distributor",
      header: "Distributeur",
      accessorFn: (row) => row.distributor.name,
    },
    {
      id: "amount",
      header: "Montant",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.amountTnd),
    },
    {
      id: "allocations",
      header: "Affectations",
      meta: { align: "right" },
      accessorFn: (row) => row.allocations.length,
    },
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference ?? "—",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Distribution"
        title="Règlements distributeurs"
        description="Ce que chaque distributeur doit et les paiements reçus."
        actions={
          <PermissionGate
            permissions={permissions}
            permission="distributor_payments.create"
          >
            <Button leftIcon={<Plus />} onClick={() => setCreating(true)}>
              Nouveau paiement
            </Button>
          </PermissionGate>
        }
      />
      <div className={styles.stack}>
        <Card padding="none">
          <CardHeader as="h2" title="Soldes" />
          <FilterBar
            search={state.q}
            onSearchChange={(q) => setState({ q, page: 1 })}
            searchPlaceholder="Rechercher un distributeur"
          />
          <DataTable<DistributorBalanceRow>
            label="Soldes distributeurs"
            columns={balanceColumns}
            data={balances.data?.items ?? []}
            total={balances.data?.total ?? 0}
            page={state.page}
            pageSize={state.pageSize}
            onChange={(change) =>
              setState({
                ...(change.page ? { page: change.page } : {}),
                ...(change.pageSize ? { pageSize: change.pageSize } : {}),
              })
            }
            loading={balances.isPending || balances.isFetching}
            error={balances.error}
            onRetry={() => void balances.refetch()}
            empty={{
              title: "Aucun solde",
              description: "Aucun distributeur ne doit d'argent.",
            }}
            getRowId={(row) => row.distributor.id}
            mobileCard={(row) => (
              <>
                <span className={styles.cardTop}>
                  <strong>{row.distributor.name}</strong>
                  <span
                    className={
                      Number(row.balanceTnd) > 0 ? styles.due : "tabular-nums"
                    }
                  >
                    {formatMoney(row.balanceTnd)}
                  </span>
                </span>
                <span className={styles.muted}>
                  Dernier paiement :{" "}
                  {row.lastPaymentAt ? formatDate(row.lastPaymentAt) : "aucun"}
                </span>
              </>
            )}
          />
        </Card>
        <Card padding="none">
          <CardHeader as="h2" title="Paiements" />
          <DataTable<DistributorPayment>
            label="Paiements distributeurs"
            columns={paymentColumns}
            data={payments.data?.items ?? []}
            total={payments.data?.total ?? 0}
            page={state.paymentsPage}
            pageSize={10}
            onChange={(change) =>
              change.page && setState({ paymentsPage: change.page })
            }
            loading={payments.isPending || payments.isFetching}
            error={payments.error}
            onRetry={() => void payments.refetch()}
            empty={{
              title: "Aucun paiement",
              description: "Les paiements des distributeurs apparaîtront ici.",
            }}
            getRowId={(row) => row.id}
            mobileCard={(row) => (
              <>
                <span className={styles.cardTop}>
                  <strong>{row.distributor.name}</strong>
                  <span className="tabular-nums">
                    {formatMoney(row.amountTnd)}
                  </span>
                </span>
                <span className={styles.muted}>
                  {formatDate(row.paidAt)} · {row.allocations.length}{" "}
                  affectation{row.allocations.length > 1 ? "s" : ""}
                </span>
              </>
            )}
          />
        </Card>
      </div>
      <DistributorPaymentDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

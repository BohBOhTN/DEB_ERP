import { Banknote, Pencil, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { Tabs } from "../../../components/ui/Tabs/Tabs.js";
import { describeError } from "../../../i18n/errors.js";
import {
  formatDate,
  formatDateTime,
  formatMoney,
} from "../../../i18n/format.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type {
  DistributorPayment,
  DistributorSale,
  Settlement,
} from "../distribution.api.js";
import {
  useCustody,
  useDistributor,
  useDistributorPayments,
  useDistributorStatementPages,
  useSettlements,
} from "../distribution.queries.js";
import { CustodyBoard } from "../components/CustodyBoard.js";
import { DirectSaleDialog } from "../components/DirectSaleDialog.js";
import { DistributorFormDialog } from "../components/DistributorFormDialog.js";
import { DistributorPaymentDialog } from "../components/DistributorPaymentDialog.js";
import { DistributorStatement } from "../components/DistributorStatement.js";
import { paymentStatePill } from "../components/distributionLabels.js";
import styles from "./DistributionPages.module.css";

/// `/distributeurs/:id` (UI-16): balance and custody as big numbers, then
/// Dépôt-vente, Ventes directes, Règlements, Relevé and Paiements.
export function DistributorDetailPage() {
  const { distributorId = "" } = useParams();
  const permissions = useSessionPermissions();
  const query = useDistributor(distributorId);
  const [dialog, setDialog] = useState<"edit" | "pay" | "sale" | null>(null);
  const distributor = query.data;

  if (query.isError) {
    const copy = describeError(query.error);
    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!distributor) {
    return <Skeleton variant="table" rows={6} />;
  }

  const owes = Number(distributor.balanceTnd) > 0;

  return (
    <>
      <PageHeader
        eyebrow="Distribution"
        title={distributor.name}
        breadcrumbs={[
          { label: "Distributeurs", href: "/distributeurs" },
          { label: distributor.name },
        ]}
        badge={
          <StatusPill status={distributor.isActive ? "ACTIVE" : "INACTIVE"} />
        }
        actions={
          <>
            <PermissionGate
              permissions={permissions}
              permission="distributor_payments.create"
            >
              <Button
                leftIcon={<Banknote />}
                onClick={() => setDialog("pay")}
                disabled={!owes}
              >
                Nouveau paiement
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="distribution.direct_sale"
            >
              <Button
                variant="secondary"
                leftIcon={<ShoppingBag />}
                onClick={() => setDialog("sale")}
              >
                Vente directe
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="distributors.update"
            >
              <Button
                variant="secondary"
                leftIcon={<Pencil />}
                onClick={() => setDialog("edit")}
              >
                Modifier
              </Button>
            </PermissionGate>
          </>
        }
      />
      <div className={styles.stack}>
        <div className={styles.summaryGrid}>
          <Card>
            <CardHeader as="h2" title="Fiche distributeur" />
            <KeyValueList
              items={[
                { label: "Téléphone", value: distributor.phone },
                {
                  label: "Identifiant fiscal",
                  value: distributor.taxIdentifier,
                },
                { label: "Adresse", value: distributor.address },
                { label: "Créé le", value: formatDate(distributor.createdAt) },
                { label: "Notes", value: distributor.notes },
              ]}
            />
          </Card>
          <Card>
            <div className={styles.bigNumbers}>
              <div className={styles.bigNumber}>
                <span className={styles.muted}>Solde dû</span>
                <strong
                  className={
                    owes ? `${styles.due} tabular-nums` : "tabular-nums"
                  }
                >
                  {formatMoney(distributor.balanceTnd)}
                </strong>
              </div>
              <div className={styles.bigNumber}>
                <span className={styles.muted}>Lignes en dépôt</span>
                <strong className="tabular-nums">
                  {distributor.heldLineCount}
                </strong>
              </div>
            </div>
          </Card>
        </div>
        <Tabs
          label="Détail du distributeur"
          items={[
            {
              value: "custody",
              label: "Dépôt-vente",
              content: <CustodyTab distributorId={distributor.id} />,
            },
            {
              value: "sales",
              label: "Ventes directes",
              content: <DirectSalesTab distributorId={distributor.id} />,
            },
            {
              value: "settlements",
              label: "Règlements",
              content: <SettlementsTab distributorId={distributor.id} />,
            },
            {
              value: "statement",
              label: "Relevé",
              content: <DistributorStatement distributorId={distributor.id} />,
            },
            {
              value: "payments",
              label: "Paiements",
              content: <PaymentsTab distributorId={distributor.id} />,
            },
          ]}
        />
      </div>
      <DistributorFormDialog
        open={dialog === "edit"}
        onOpenChange={(open) => setDialog(open ? "edit" : null)}
        distributor={distributor}
      />
      <DistributorPaymentDialog
        open={dialog === "pay"}
        onOpenChange={(open) => setDialog(open ? "pay" : null)}
        distributor={distributor}
      />
      <DirectSaleDialog
        open={dialog === "sale"}
        onOpenChange={(open) => setDialog(open ? "sale" : null)}
        distributor={distributor}
      />
    </>
  );
}

function CustodyTab({ distributorId }: { distributorId: string }) {
  const query = useCustody(distributorId);
  if (query.isPending) return <Skeleton variant="table" rows={3} />;
  if (query.isError) {
    const copy = describeError(query.error);
    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <CustodyBoard items={query.data.items} />;
}

function DirectSalesTab({ distributorId }: { distributorId: string }) {
  const query = useDistributorStatementPages(distributorId, {});
  const sales = query.data?.pages[0]?.sales ?? [];
  const columns: DataTableColumn<DistributorSale & { balanceTnd: string }>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference,
    },
    { id: "date", header: "Date", accessorFn: (row) => formatDate(row.soldAt) },
    {
      id: "total",
      header: "Total",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.totalTnd),
    },
    {
      id: "balance",
      header: "Reste",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.balanceTnd),
    },
    {
      id: "state",
      header: "Paiement",
      cell: ({ row }) => (
        <StatusPill {...paymentStatePill(row.original.paymentState)} />
      ),
    },
  ];
  return (
    <DataTable<DistributorSale & { balanceTnd: string }>
      label="Ventes directes du distributeur"
      columns={columns}
      data={sales}
      total={sales.length}
      page={1}
      pageSize={Math.max(sales.length, 1)}
      onChange={() => undefined}
      loading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={{
        title: "Aucune vente directe",
        description: "Les ventes directes à ce distributeur apparaîtront ici.",
      }}
      getRowId={(row) => row.id}
      mobileCard={(row) => (
        <>
          <span className={styles.cardTop}>
            <strong>{row.reference}</strong>
            <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
          </span>
          <span className={styles.muted}>
            {formatDate(row.soldAt)} · reste {formatMoney(row.balanceTnd)}
          </span>
        </>
      )}
    />
  );
}

function SettlementsTab({ distributorId }: { distributorId: string }) {
  const [page, setPage] = useState(1);
  const query = useSettlements({
    page,
    pageSize: 10,
    distributorId,
    sort: { field: "settledAt", direction: "desc" },
  });
  const columns: DataTableColumn<Settlement>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference,
    },
    {
      id: "dispatch",
      header: "Sortie",
      cell: ({ row }) =>
        row.original.dispatch ? (
          <Link to={`/distribution/sorties/${row.original.dispatchId}`}>
            {row.original.dispatch.reference}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "date",
      header: "Date",
      accessorFn: (row) => formatDateTime(row.settledAt),
    },
    {
      id: "total",
      header: "Vendu",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.totalTnd),
    },
    {
      id: "remaining",
      header: "Reste",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.remainingDueTnd),
    },
    {
      id: "state",
      header: "Paiement",
      cell: ({ row }) => (
        <StatusPill {...paymentStatePill(row.original.paymentState)} />
      ),
    },
  ];
  return (
    <DataTable<Settlement>
      label="Règlements du distributeur"
      columns={columns}
      data={query.data?.items ?? []}
      total={query.data?.total ?? 0}
      page={page}
      pageSize={10}
      onChange={(change) => change.page && setPage(change.page)}
      loading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={{
        title: "Aucun règlement",
        description:
          "Les règlements de dépôt-vente de ce distributeur apparaîtront ici.",
      }}
      getRowId={(row) => row.id}
      mobileCard={(row) => (
        <>
          <span className={styles.cardTop}>
            <strong>{row.reference}</strong>
            <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
          </span>
          <span className={styles.muted}>
            {formatDateTime(row.settledAt)} · reste{" "}
            {formatMoney(row.remainingDueTnd)}
          </span>
        </>
      )}
    />
  );
}

function PaymentsTab({ distributorId }: { distributorId: string }) {
  const [page, setPage] = useState(1);
  const query = useDistributorPayments({
    page,
    pageSize: 10,
    distributorId,
    sort: { field: "paidAt", direction: "desc" },
  });
  const columns: DataTableColumn<DistributorPayment>[] = [
    { id: "date", header: "Date", accessorFn: (row) => formatDate(row.paidAt) },
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
    <DataTable<DistributorPayment>
      label="Paiements du distributeur"
      columns={columns}
      data={query.data?.items ?? []}
      total={query.data?.total ?? 0}
      page={page}
      pageSize={10}
      onChange={(change) => change.page && setPage(change.page)}
      loading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={{
        title: "Aucun paiement",
        description: "Les paiements de ce distributeur apparaîtront ici.",
      }}
      getRowId={(row) => row.id}
      mobileCard={(row) => (
        <>
          <span className={styles.cardTop}>
            <strong className="tabular-nums">
              {formatMoney(row.amountTnd)}
            </strong>
            <span className={styles.muted}>{formatDate(row.paidAt)}</span>
          </span>
        </>
      )}
    />
  );
}

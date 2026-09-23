import { Banknote, Pencil } from "lucide-react";
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
import { formatDate, formatMoney } from "../../../i18n/format.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { Purchase, SupplierPayment } from "../procurement.api.js";
import {
  usePurchases,
  useSupplier,
  useSupplierPayments,
} from "../procurement.queries.js";
import { paymentStatePill } from "../components/procurementLabels.js";
import { SupplierFormDialog } from "../components/SupplierFormDialog.js";
import { SupplierPaymentDialog } from "../components/SupplierPaymentDialog.js";
import { SupplierStatement } from "../components/SupplierStatement.js";
import styles from "./ProcurementPages.module.css";

/// `/fournisseurs/:id` (UI-12): the balance as a big number with "Payer",
/// then Achats, Relevé and Paiements.
export function SupplierDetailPage() {
  const { supplierId = "" } = useParams();
  const permissions = useSessionPermissions();
  const query = useSupplier(supplierId);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const supplier = query.data;

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

  if (!supplier) {
    return <Skeleton variant="table" rows={6} />;
  }

  const owes = Number(supplier.balanceTnd) > 0;

  return (
    <>
      <PageHeader
        eyebrow="Achats"
        title={supplier.name}
        breadcrumbs={[
          { label: "Fournisseurs", href: "/fournisseurs" },
          { label: supplier.name },
        ]}
        badge={
          <StatusPill status={supplier.isActive ? "ACTIVE" : "INACTIVE"} />
        }
        actions={
          <>
            <PermissionGate
              permissions={permissions}
              permission="supplier_payments.create"
            >
              <Button
                leftIcon={<Banknote />}
                onClick={() => setPaying(true)}
                disabled={!owes}
              >
                Payer
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="suppliers.update"
            >
              <Button
                variant="secondary"
                leftIcon={<Pencil />}
                onClick={() => setEditing(true)}
              >
                Modifier
              </Button>
            </PermissionGate>
          </>
        }
      />
      <div className={styles.tabBody}>
        <div className={styles.summaryGrid}>
          <Card>
            <CardHeader as="h2" title="Fiche fournisseur" />
            <KeyValueList
              items={[
                { label: "Téléphone", value: supplier.phone },
                { label: "Identifiant fiscal", value: supplier.taxIdentifier },
                { label: "Adresse", value: supplier.address },
                { label: "Créé le", value: formatDate(supplier.createdAt) },
                { label: "Notes", value: supplier.notes },
              ]}
            />
          </Card>
          <Card tone={owes ? "default" : "muted"}>
            <div className={styles.bigNumber}>
              <span className={styles.muted}>Solde dû</span>
              <strong
                className={owes ? `${styles.due} tabular-nums` : "tabular-nums"}
              >
                {formatMoney(supplier.balanceTnd)}
              </strong>
              <span className={styles.muted}>
                {owes
                  ? "Achats validés moins paiements."
                  : "Rien n'est dû à ce fournisseur."}
              </span>
            </div>
          </Card>
        </div>
        <Tabs
          label="Détail du fournisseur"
          items={[
            {
              value: "purchases",
              label: "Achats",
              content: <SupplierPurchasesTab supplierId={supplier.id} />,
            },
            {
              value: "statement",
              label: "Relevé",
              content: <SupplierStatement supplierId={supplier.id} />,
            },
            {
              value: "payments",
              label: "Paiements",
              content: <SupplierPaymentsTab supplierId={supplier.id} />,
            },
          ]}
        />
      </div>
      <SupplierFormDialog
        open={editing}
        onOpenChange={setEditing}
        supplier={supplier}
      />
      <SupplierPaymentDialog
        open={paying}
        onOpenChange={setPaying}
        supplier={supplier}
      />
    </>
  );
}

function SupplierPurchasesTab({ supplierId }: { supplierId: string }) {
  const [page, setPage] = useState(1);
  const query = usePurchases({
    page,
    pageSize: 10,
    supplierId,
    sort: { field: "purchaseDate", direction: "desc" },
  });
  const columns: DataTableColumn<Purchase>[] = [
    {
      id: "reference",
      header: "Référence",
      cell: ({ row }) => (
        <Link to={`/achats/${row.original.id}`}>
          {row.original.reference ?? "Brouillon"}
        </Link>
      ),
    },
    {
      id: "date",
      header: "Date",
      accessorFn: (row) => formatDate(row.purchaseDate),
    },
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
      id: "status",
      header: "Statut",
      cell: ({ row }) =>
        row.original.status === "POSTED" ? (
          <StatusPill {...paymentStatePill(row.original.paymentState)} />
        ) : (
          <StatusPill status={row.original.status} />
        ),
    },
  ];

  return (
    <DataTable<Purchase>
      label="Achats du fournisseur"
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
        title: "Aucun achat",
        description: "Les achats de ce fournisseur apparaîtront ici.",
      }}
      getRowId={(row) => row.id}
      mobileCard={(row) => (
        <>
          <span className={styles.cardTop}>
            <strong>{row.reference ?? "Brouillon"}</strong>
            <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
          </span>
          <span className={styles.muted}>
            {formatDate(row.purchaseDate)} · reste {formatMoney(row.balanceTnd)}
          </span>
          {row.status === "POSTED" ? (
            <StatusPill {...paymentStatePill(row.paymentState)} />
          ) : (
            <StatusPill status={row.status} />
          )}
        </>
      )}
    />
  );
}

function SupplierPaymentsTab({ supplierId }: { supplierId: string }) {
  const [page, setPage] = useState(1);
  const query = useSupplierPayments({
    page,
    pageSize: 10,
    supplierId,
    sort: { field: "paidAt", direction: "desc" },
  });
  const columns: DataTableColumn<SupplierPayment>[] = [
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
    <DataTable<SupplierPayment>
      label="Paiements du fournisseur"
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
        description: "Les paiements faits à ce fournisseur apparaîtront ici.",
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
          <span className={styles.muted}>
            {row.allocations.length} affectation
            {row.allocations.length > 1 ? "s" : ""}
            {row.reference ? ` · ${row.reference}` : ""}
          </span>
        </>
      )}
    />
  );
}

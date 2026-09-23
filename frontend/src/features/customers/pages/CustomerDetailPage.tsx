import { Banknote, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import type { Order } from "../../orders/orders.api.js";
import { useOrders } from "../../orders/orders.queries.js";
import type { CustomerPayment, SaleSummary } from "../customers.api.js";
import {
  useCustomer,
  useCustomerPayments,
  useCustomerStatementPages,
} from "../customers.queries.js";
import { salePaymentPill } from "../components/customerLabels.js";
import { CustomerFormDialog } from "../components/CustomerFormDialog.js";
import { CustomerPaymentDialog } from "../components/CustomerPaymentDialog.js";
import { CustomerStatement } from "../components/CustomerStatement.js";
import styles from "./CustomerPages.module.css";

/// `/clients/:id` (UI-13): two big numbers, the payment and order actions,
/// then Ventes, Commandes, Relevé and Règlements.
export function CustomerDetailPage() {
  const { customerId = "" } = useParams();
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const query = useCustomer(customerId);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const customer = query.data;

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

  if (!customer) {
    return <Skeleton variant="table" rows={6} />;
  }

  const owes = Number(customer.balanceTnd) > 0;

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title={customer.name}
        breadcrumbs={[
          { label: "Clients", href: "/clients" },
          { label: customer.name },
        ]}
        badge={
          <StatusPill status={customer.isActive ? "ACTIVE" : "INACTIVE"} />
        }
        actions={
          <>
            <PermissionGate
              permissions={permissions}
              permission="customer_payments.create"
            >
              <Button
                leftIcon={<Banknote />}
                onClick={() => setPaying(true)}
                disabled={!owes}
              >
                Encaisser un règlement
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="orders.create"
            >
              <Button
                variant="secondary"
                leftIcon={<Plus />}
                onClick={() =>
                  navigate(
                    `/commandes/nouvelle?customerId=${customer.id}&customerName=${encodeURIComponent(customer.name)}`,
                  )
                }
              >
                Nouvelle commande
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="customers.update"
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
            <CardHeader as="h2" title="Fiche client" />
            <KeyValueList
              items={[
                { label: "Téléphone", value: customer.phone },
                { label: "Adresse", value: customer.address },
                { label: "Créé le", value: formatDate(customer.createdAt) },
                { label: "Notes", value: customer.notes },
              ]}
            />
          </Card>
          <Card>
            <div className={styles.bigNumbers}>
              <div className={styles.bigNumber}>
                <span className={styles.muted}>Reste à payer</span>
                <strong
                  className={
                    owes ? `${styles.due} tabular-nums` : "tabular-nums"
                  }
                >
                  {formatMoney(customer.balanceTnd)}
                </strong>
              </div>
              <div className={styles.bigNumber}>
                <span className={styles.muted}>Avance disponible</span>
                <strong className="tabular-nums">
                  {formatMoney(customer.advanceBalanceTnd)}
                </strong>
              </div>
            </div>
          </Card>
        </div>
        <Tabs
          label="Détail du client"
          items={[
            {
              value: "sales",
              label: "Ventes",
              content: <CustomerSalesTab customerId={customer.id} />,
            },
            {
              value: "orders",
              label: "Commandes",
              content: <CustomerOrdersTab customerId={customer.id} />,
            },
            {
              value: "statement",
              label: "Relevé",
              content: <CustomerStatement customerId={customer.id} />,
            },
            {
              value: "payments",
              label: "Règlements",
              content: <CustomerPaymentsTab customerId={customer.id} />,
            },
          ]}
        />
      </div>
      <CustomerFormDialog
        open={editing}
        onOpenChange={setEditing}
        customer={customer}
      />
      <CustomerPaymentDialog
        open={paying}
        onOpenChange={setPaying}
        customer={customer}
      />
    </>
  );
}

/// Sales come from the statement, which carries each sale's remaining due.
function CustomerSalesTab({ customerId }: { customerId: string }) {
  const query = useCustomerStatementPages(customerId, {});
  const sales = query.data?.pages[0]?.sales ?? [];
  const columns: DataTableColumn<SaleSummary & { balanceTnd: string }>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference,
    },
    {
      id: "date",
      header: "Date",
      accessorFn: (row) => formatDateTime(row.soldAt),
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
      id: "state",
      header: "Paiement",
      cell: ({ row }) => (
        <StatusPill {...salePaymentPill(row.original.paymentState)} />
      ),
    },
  ];

  return (
    <DataTable<SaleSummary & { balanceTnd: string }>
      label="Ventes du client"
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
        title: "Aucune vente",
        description: "Les ventes de ce client apparaîtront ici.",
      }}
      getRowId={(row) => row.id}
      mobileCard={(row) => (
        <>
          <span className={styles.cardTop}>
            <strong>{row.reference}</strong>
            <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
          </span>
          <span className={styles.muted}>
            {formatDateTime(row.soldAt)} · reste {formatMoney(row.balanceTnd)}
          </span>
          <StatusPill {...salePaymentPill(row.paymentState)} />
        </>
      )}
    />
  );
}

function CustomerOrdersTab({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1);
  const query = useOrders({
    page,
    pageSize: 10,
    customerId,
    sort: { field: "requestedFulfillmentAt", direction: "desc" },
  });
  const columns: DataTableColumn<Order>[] = [
    {
      id: "reference",
      header: "Référence",
      cell: ({ row }) => (
        <Link to={`/commandes/${row.original.id}`}>
          {row.original.reference}
        </Link>
      ),
    },
    {
      id: "for",
      header: "Pour le",
      accessorFn: (row) => formatDateTime(row.requestedFulfillmentAt),
    },
    {
      id: "total",
      header: "Total",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.totalTnd),
    },
    {
      id: "advance",
      header: "Avance",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.advanceBalanceTnd),
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => <StatusPill status={row.original.status} />,
    },
  ];

  return (
    <DataTable<Order>
      label="Commandes du client"
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
        title: "Aucune commande",
        description: "Les commandes de ce client apparaîtront ici.",
      }}
      getRowId={(row) => row.id}
      mobileCard={(row) => (
        <>
          <span className={styles.cardTop}>
            <strong>{row.reference}</strong>
            <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
          </span>
          <span className={styles.muted}>
            {formatDateTime(row.requestedFulfillmentAt)}
          </span>
          <StatusPill status={row.status} />
        </>
      )}
    />
  );
}

function CustomerPaymentsTab({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1);
  const query = useCustomerPayments({
    page,
    pageSize: 10,
    customerId,
    sort: { field: "paidAt", direction: "desc" },
  });
  const columns: DataTableColumn<CustomerPayment>[] = [
    { id: "date", header: "Date", accessorFn: (row) => formatDate(row.paidAt) },
    {
      id: "amount",
      header: "Montant",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.amountTnd),
    },
    {
      id: "source",
      header: "Source",
      accessorFn: (row) => (row.sessionId ? "Caisse" : "Bureau"),
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
    <DataTable<CustomerPayment>
      label="Règlements du client"
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
        description: "Les règlements de ce client apparaîtront ici.",
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
            {row.sessionId ? "Encaissé à la caisse" : "Encaissé au bureau"} ·{" "}
            {row.allocations.length} affectation
            {row.allocations.length > 1 ? "s" : ""}
          </span>
        </>
      )}
    />
  );
}

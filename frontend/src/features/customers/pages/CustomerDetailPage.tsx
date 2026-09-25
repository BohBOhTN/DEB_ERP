import {
  Banknote,
  MoreHorizontal,
  Pencil,
  Plus,
  Undo2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { ReversePaymentDialog } from "../../../components/patterns/ReversePaymentDialog/ReversePaymentDialog.js";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog.js";
import { DropdownMenu } from "../../../components/ui/DropdownMenu/DropdownMenu.js";
import { useConfirm } from "../../../lib/hooks/useConfirm.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
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
  useCustomerSales,
  useCustomerSummary,
  useReverseCustomerPayment,
  useSetCustomerActive,
} from "../customers.queries.js";
import { salePill } from "../components/customerLabels.js";
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
  const toast = useToast();
  const query = useCustomer(customerId);
  const summary = useCustomerSummary(customerId);
  const activation = useConfirm();
  const setActive = useSetCustomerActive();
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
  const count = (value: number | undefined) => value ?? 0;

  const toggleActive = async () => {
    const deactivating = customer.isActive;
    const { confirmed } = await activation.confirm({
      title: deactivating
        ? `Désactiver ${customer.name} ?`
        : `Réactiver ${customer.name} ?`,
      tone: deactivating ? "danger" : "default",
      confirmLabel: deactivating ? "Désactiver" : "Réactiver",
      impact: deactivating
        ? "Le client ne sera plus proposé pour une vente à crédit, une commande ou un règlement. Ses ventes, commandes et règlements restent consultables."
        : "Le client sera de nouveau proposé pour les ventes à crédit, les commandes et les règlements.",
    });
    if (!confirmed) return;
    try {
      await setActive.mutateAsync({
        customerId: customer.id,
        isActive: !deactivating,
      });
      toast.success(
        deactivating ? "Client désactivé" : "Client réactivé",
        customer.name,
      );
    } catch (error) {
      toast.fromError(error);
    }
  };

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
                disabled={!owes || !customer.isActive}
              >
                Encaisser un règlement
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="customers.deactivate"
            >
              <Button
                variant={customer.isActive ? "danger" : "secondary"}
                leftIcon={customer.isActive ? <UserMinus /> : <UserPlus />}
                loading={setActive.isPending}
                onClick={() => void toggleActive()}
              >
                {customer.isActive ? "Désactiver" : "Réactiver"}
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
                { label: "Identifiant fiscal", value: customer.taxIdentifier },
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
        <KpiGrid columns={4}>
          <KpiTile
            label="Commandes"
            value={count(summary.data?.ordersCount)}
            note={`dont ${count(summary.data?.openOrdersCount)} ouverte${count(summary.data?.openOrdersCount) > 1 ? "s" : ""} · sans les annulées`}
            loading={summary.isPending}
          />
          <KpiTile
            label="Ventes"
            value={count(summary.data?.salesCount)}
            note={`${formatMoney(summary.data?.salesTotalTnd ?? "0")}${count(summary.data?.cancelledSalesCount) > 0 ? ` · ${count(summary.data?.cancelledSalesCount)} annulée${count(summary.data?.cancelledSalesCount) > 1 ? "s" : ""}` : ""}`}
            loading={summary.isPending}
          />
          <KpiTile
            label="Payé"
            value={formatMoney(summary.data?.paidTnd ?? "0")}
            note={
              summary.data?.lastPaymentAt
                ? `dernier règlement le ${formatDate(summary.data.lastPaymentAt)}`
                : "aucun règlement"
            }
            loading={summary.isPending}
          />
          <KpiTile
            label="Dû"
            value={formatMoney(summary.data?.dueTnd ?? "0")}
            note={
              summary.data?.lastSaleAt
                ? `dernière vente le ${formatDate(summary.data.lastSaleAt)}`
                : "aucune vente"
            }
            loading={summary.isPending}
            featured
          />
        </KpiGrid>
        <Tabs
          label="Détail du client"
          items={[
            ...(permissions.has("customer_balances.view")
              ? [
                  {
                    value: "sales",
                    label: "Ventes",
                    content: <CustomerSalesTab customerId={customer.id} />,
                  },
                ]
              : []),
            {
              value: "orders",
              label: "Commandes",
              content: <CustomerOrdersTab customerId={customer.id} />,
            },
            ...(permissions.has("customer_balances.view")
              ? [
                  {
                    value: "statement",
                    label: "Relevé",
                    content: <CustomerStatement customerId={customer.id} />,
                  },
                ]
              : []),
            ...(permissions.has("customer_payments.view")
              ? [
                  {
                    value: "payments",
                    label: "Règlements",
                    content: <CustomerPaymentsTab customerId={customer.id} />,
                  },
                ]
              : []),
          ]}
        />
      </div>
      <ConfirmDialog {...activation.dialog} />
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

/// Every sale of the customer, paged, with the balance the ledger still
/// carries and the state pill (issue #46).
function CustomerSalesTab({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1);
  const query = useCustomerSales(customerId, { page, pageSize: 10 });
  const columns: DataTableColumn<SaleSummary & { balanceTnd: string }>[] = [
    {
      id: "reference",
      header: "Référence",
      cell: ({ row }) => (
        <Link to={`/caisse/ventes/${row.original.id}`}>
          {row.original.reference}
        </Link>
      ),
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
      id: "paid",
      header: "Payé",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.paidAmountTnd),
    },
    {
      id: "balance",
      header: "Reste",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.balanceTnd),
    },
    {
      id: "state",
      header: "État",
      cell: ({ row }) => <StatusPill {...salePill(row.original)} />,
    },
  ];

  return (
    <DataTable<SaleSummary & { balanceTnd: string }>
      label="Ventes du client"
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
          <StatusPill {...salePill(row)} />
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
  const permissions = useSessionPermissions();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [reversing, setReversing] = useState<CustomerPayment | null>(null);
  const reverse = useReverseCustomerPayment();
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
    {
      id: "state",
      header: "État",
      cell: ({ row }) =>
        row.original.reversedAt ? (
          <StatusPill status="CANCELLED" label="Annulé" />
        ) : (
          <StatusPill status="POSTED" label="Encaissé" />
        ),
    },
  ];

  return (
    <>
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
              {row.reversedAt
                ? "Annulé"
                : row.sessionId
                  ? "Encaissé à la caisse"
                  : "Encaissé au bureau"}{" "}
              · {row.allocations.length} affectation
              {row.allocations.length > 1 ? "s" : ""}
            </span>
          </>
        )}
        rowActions={(row) =>
          row.reversedAt ||
          !permissions.has("customer_payments.create") ? null : (
            <DropdownMenu
              label="Actions de la ligne"
              trigger={
                <IconButton
                  label="Actions"
                  icon={<MoreHorizontal />}
                  variant="ghost"
                  size="sm"
                />
              }
              items={[
                {
                  id: "reverse",
                  label: "Annuler le règlement",
                  icon: <Undo2 />,
                  onSelect: () => setReversing(row),
                },
              ]}
            />
          )
        }
      />
      {reversing ? (
        <ReversePaymentDialog
          open
          kind="reglement"
          partyName={reversing.customer?.name ?? "ce client"}
          amountTnd={reversing.amountTnd}
          paidAt={reversing.paidAt}
          documents={reversing.allocations
            .map((allocation) => allocation.sale?.reference)
            .filter((reference): reference is string => Boolean(reference))}
          collectedAtTill={Boolean(reversing.sessionId)}
          onPost={async (idempotencyKey, reason) => {
            await reverse.mutateAsync({
              paymentId: reversing.id,
              reason,
              idempotencyKey,
            });
            toast.success(
              "Règlement annulé",
              `${formatMoney(reversing.amountTnd)} remis au solde du client.`,
            );
            setReversing(null);
          }}
          onClose={() => setReversing(null)}
        />
      ) : null}
    </>
  );
}

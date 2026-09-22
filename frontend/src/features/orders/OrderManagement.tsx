import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "../auth/authApi";
import {
  getPosCustomers,
  getPosProducts,
  type PosProduct,
} from "../pos/posApi";
import type { Customer } from "../customers/customersApi";
import {
  cancelOrder,
  changeOrderStatus,
  completeOrder,
  createOrder,
  getOrder,
  getOrders,
  orderStatusLabels,
  recordOrderAdvance,
  type AdvanceDisposition,
  type CustomerOrder,
  type OrderStatus,
} from "./ordersApi";

interface OrderManagementProps {
  user: CurrentUser;
}

/// Mirrors the backend transition table. COMPLETED and CANCELLED have their own
/// commands because they move money and stock.
const nextStatuses: Partial<Record<OrderStatus, OrderStatus>> = {
  DRAFT: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
};

const completableStatuses: OrderStatus[] = ["CONFIRMED", "PREPARING", "READY"];

const queueFilters: Array<{ value: OrderStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "Toutes" },
  { value: "DRAFT", label: "Brouillons" },
  { value: "CONFIRMED", label: "Confirmees" },
  { value: "PREPARING", label: "En preparation" },
  { value: "READY", label: "Pretes" },
  { value: "COMPLETED", label: "Terminees" },
  { value: "CANCELLED", label: "Annulees" },
];

export function OrderManagement({ user }: OrderManagementProps) {
  const permissions = useMemo(
    () => new Set(user.effectivePermissions),
    [user.effectivePermissions],
  );
  const canViewOrders = permissions.has("orders.view");
  const canCreateOrders = permissions.has("orders.create");
  const canChangeStatus = permissions.has("orders.change_status");
  const canRecordAdvance =
    permissions.has("orders.update") &&
    permissions.has("customer_payments.create");
  const canCompleteOrders = permissions.has("orders.complete");
  const canCancelOrders = permissions.has("orders.cancel");

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(
    null,
  );
  const [queueFilter, setQueueFilter] = useState<OrderStatus | "ALL">("ALL");
  const [orderForm, setOrderForm] = useState({
    customerId: "",
    requestedFulfillmentAt: "",
    notes: "",
  });
  const [cart, setCart] = useState<
    Array<{ productId: string; quantity: string }>
  >([]);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [completionPayment, setCompletionPayment] = useState("");
  const [cancellation, setCancellation] = useState<{
    reason: string;
    advanceDisposition: AdvanceDisposition | "";
  }>({ reason: "", advanceDisposition: "" });
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void refresh();
  }, [canViewOrders, canCreateOrders, queueFilter]);

  async function refresh() {
    setError("");
    setIsLoading(true);

    try {
      const [orderPage, productPage, customerPage] = await Promise.all([
        canViewOrders
          ? getOrders(queueFilter === "ALL" ? {} : { status: queueFilter })
          : Promise.resolve(emptyPage<CustomerOrder>()),
        canCreateOrders
          ? getPosProducts()
          : Promise.resolve(emptyPage<PosProduct>()),
        canCreateOrders
          ? getPosCustomers()
          : Promise.resolve(emptyPage<Customer>()),
      ]);
      setOrders(orderPage.items);
      setProducts(productPage.items);
      setCustomers(customerPage.items);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }

  const cartTotal = useMemo(
    () =>
      cart.reduce((total, line) => {
        const product = products.find((item) => item.id === line.productId);
        return (
          total +
          Number(product?.salePriceTnd ?? 0) * Number(line.quantity || 0)
        );
      }, 0),
    [cart, products],
  );

  function addCartLine(productId: string) {
    if (!productId || cart.some((line) => line.productId === productId)) {
      return;
    }

    setCart([...cart, { productId, quantity: "1" }]);
  }

  async function handleCreateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (cart.length === 0) {
      setError("Ajoutez au moins un produit a la commande.");
      return;
    }

    await runCommand(async () => {
      const order = await createOrder({
        customerId: orderForm.customerId,
        requestedFulfillmentAt: new Date(
          orderForm.requestedFulfillmentAt,
        ).toISOString(),
        notes: orderForm.notes,
        lines: cart,
      });
      setOrderForm({ customerId: "", requestedFulfillmentAt: "", notes: "" });
      setCart([]);
      setSelectedOrder(order);
      return "Commande enregistree. Aucune vente n'est encore creee.";
    });
  }

  async function handleAdvanceStatus(order: CustomerOrder) {
    const target = nextStatuses[order.status];

    if (!target) {
      return;
    }

    await runCommand(async () => {
      const updated = await changeOrderStatus(order.id, {
        version: order.version,
        status: target,
      });
      setSelectedOrder(updated);
      return `Commande ${orderStatusLabels[target].toLowerCase()}.`;
    });
  }

  async function handleRecordAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrder) {
      return;
    }

    await runCommand(async () => {
      const updated = await recordOrderAdvance(selectedOrder.id, {
        amountTnd: advanceAmount,
        paidAt: new Date().toISOString(),
      });
      setAdvanceAmount("");
      setSelectedOrder(updated);
      return "Avance encaissee. Aucun chiffre d'affaires n'est reconnu.";
    });
  }

  async function handleComplete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrder) {
      return;
    }

    await runCommand(async () => {
      const updated = await completeOrder(selectedOrder.id, {
        completedAt: new Date().toISOString(),
        ...(completionPayment ? { paidAmountTnd: completionPayment } : {}),
      });
      setCompletionPayment("");
      setSelectedOrder(updated);
      return "Commande terminee. Une vente liee a ete creee.";
    });
  }

  async function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrder) {
      return;
    }

    const heldAdvance = Number(selectedOrder.advanceBalanceTnd);

    if (heldAdvance > 0 && !cancellation.advanceDisposition) {
      setError(
        "Choisissez le remboursement ou le credit client pour l'avance.",
      );
      return;
    }

    await runCommand(async () => {
      const updated = await cancelOrder(selectedOrder.id, {
        cancelledAt: new Date().toISOString(),
        reason: cancellation.reason,
        ...(cancellation.advanceDisposition
          ? { advanceDisposition: cancellation.advanceDisposition }
          : {}),
      });
      setCancellation({ reason: "", advanceDisposition: "" });
      setSelectedOrder(updated);
      return "Commande annulee.";
    });
  }

  async function runCommand(action: () => Promise<string>) {
    setIsSubmitting(true);
    setError("");
    setStatus("");

    try {
      setStatus(await action());
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function selectOrder(orderId: string) {
    setError("");

    try {
      setSelectedOrder(await getOrder(orderId));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (!canViewOrders && !canCreateOrders) {
    return (
      <section className="orders-workspace" aria-labelledby="orders-title">
        <h2 id="orders-title">Commandes client</h2>
        <p className="status-muted">
          Vous n'avez pas l'autorisation de consulter les commandes.
        </p>
      </section>
    );
  }

  const heldAdvance = Number(selectedOrder?.advanceBalanceTnd ?? 0);

  return (
    <section className="orders-workspace" aria-labelledby="orders-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Commandes client</p>
          <h2 id="orders-title">Commandes pour plus tard</h2>
        </div>
        <span className="permission-count">{orders.length}</span>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {status ? <p className="status-active">{status}</p> : null}

      <div className="orders-grid">
        <div className="panel">
          <div className="panel-heading">
            <h3>File des commandes</h3>
            <span>{orders.length}</span>
          </div>

          <div
            className="filter-row"
            role="group"
            aria-label="Filtrer par statut"
          >
            {queueFilters.map((filter) => (
              <button
                aria-pressed={queueFilter === filter.value}
                className="chip-button"
                key={filter.value}
                onClick={() => setQueueFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <p className="status-muted">Chargement des commandes...</p>
          ) : orders.length === 0 ? (
            <p className="status-muted">Aucune commande pour ce filtre.</p>
          ) : (
            <ul className="record-list">
              {orders.map((order) => (
                <li key={order.id}>
                  <button
                    aria-pressed={selectedOrder?.id === order.id}
                    className="record-button"
                    onClick={() => void selectOrder(order.id)}
                    type="button"
                  >
                    <span className="record-title">{order.reference}</span>
                    <span className="record-meta">
                      {order.customer?.name ?? "Client"} ·{" "}
                      {formatDateTime(order.requestedFulfillmentAt)}
                    </span>
                    <span className="record-meta">
                      {orderStatusLabels[order.status]} ·{" "}
                      {formatTnd(order.totalTnd)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canCreateOrders ? (
          <div className="panel">
            <div className="panel-heading">
              <h3>Nouvelle commande</h3>
            </div>

            <form className="inline-form" onSubmit={handleCreateOrder}>
              <label className="field">
                Client
                <select
                  onChange={(event) =>
                    setOrderForm({
                      ...orderForm,
                      customerId: event.target.value,
                    })
                  }
                  required
                  value={orderForm.customerId}
                >
                  <option value="">Selectionnez un client</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Date et heure souhaitees
                <input
                  onChange={(event) =>
                    setOrderForm({
                      ...orderForm,
                      requestedFulfillmentAt: event.target.value,
                    })
                  }
                  required
                  type="datetime-local"
                  value={orderForm.requestedFulfillmentAt}
                />
              </label>

              <label className="field">
                Ajouter un produit
                <select
                  onChange={(event) => {
                    addCartLine(event.target.value);
                    event.target.value = "";
                  }}
                  value=""
                >
                  <option value="">Selectionnez un produit</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {formatTnd(product.salePriceTnd)}
                    </option>
                  ))}
                </select>
              </label>

              {cart.length === 0 ? (
                <p className="status-muted">Aucune ligne.</p>
              ) : (
                <ul className="record-list">
                  {cart.map((line) => {
                    const product = products.find(
                      (item) => item.id === line.productId,
                    );

                    return (
                      <li className="cart-line" key={line.productId}>
                        <span>{product?.name ?? line.productId}</span>
                        <input
                          aria-label={`Quantite ${product?.name ?? ""}`}
                          min="0.001"
                          onChange={(event) =>
                            setCart(
                              cart.map((item) =>
                                item.productId === line.productId
                                  ? { ...item, quantity: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          step="0.001"
                          type="number"
                          value={line.quantity}
                        />
                        <button
                          className="secondary-button"
                          onClick={() =>
                            setCart(
                              cart.filter(
                                (item) => item.productId !== line.productId,
                              ),
                            )
                          }
                          type="button"
                        >
                          Retirer
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <label className="field">
                Notes
                <input
                  onChange={(event) =>
                    setOrderForm({ ...orderForm, notes: event.target.value })
                  }
                  value={orderForm.notes}
                />
              </label>

              <div className="metric-row">
                <span>Total estime</span>
                <strong>{formatTnd(String(cartTotal))}</strong>
              </div>
              <p className="status-muted">
                Le total definitif est calcule par le serveur. Une commande ne
                cree ni vente ni mouvement de stock.
              </p>

              <button
                className="primary-button"
                disabled={isSubmitting}
                type="submit"
              >
                Enregistrer la commande
              </button>
            </form>
          </div>
        ) : null}

        <div className="panel">
          <div className="panel-heading">
            <h3>Detail de la commande</h3>
          </div>

          {!selectedOrder ? (
            <p className="status-muted">Selectionnez une commande.</p>
          ) : (
            <div className="assignment-panel">
              <div className="metric-row">
                <span>Reference</span>
                <strong>{selectedOrder.reference}</strong>
              </div>
              <div className="metric-row">
                <span>Statut</span>
                <strong>{orderStatusLabels[selectedOrder.status]}</strong>
              </div>
              <div className="metric-row">
                <span>Total</span>
                <strong>{formatTnd(selectedOrder.totalTnd)}</strong>
              </div>
              <div className="metric-row">
                <span>Avance detenue</span>
                <strong>{formatTnd(selectedOrder.advanceBalanceTnd)}</strong>
              </div>
              <div className="metric-row">
                <span>Reste a payer a la remise</span>
                <strong>
                  {formatTnd(
                    String(
                      Number(selectedOrder.totalTnd) -
                        Number(selectedOrder.advanceBalanceTnd),
                    ),
                  )}
                </strong>
              </div>

              {selectedOrder.saleId ? (
                <p className="status-active">
                  Vente liee creee. Cette commande ne peut plus etre terminee.
                </p>
              ) : null}

              {selectedOrder.cancellationReason ? (
                <p className="status-muted">
                  Annulee : {selectedOrder.cancellationReason}
                  {selectedOrder.advanceDisposition
                    ? selectedOrder.advanceDisposition === "REFUNDED"
                      ? " · avance remboursee"
                      : " · avance conservee en credit client"
                    : ""}
                </p>
              ) : null}

              {canChangeStatus && nextStatuses[selectedOrder.status] ? (
                <button
                  className="secondary-button"
                  disabled={isSubmitting}
                  onClick={() => void handleAdvanceStatus(selectedOrder)}
                  type="button"
                >
                  Passer a{" "}
                  {orderStatusLabels[
                    nextStatuses[selectedOrder.status] as OrderStatus
                  ].toLowerCase()}
                </button>
              ) : null}

              {canRecordAdvance &&
              completableStatuses
                .concat("DRAFT")
                .includes(selectedOrder.status) ? (
                <form className="inline-form" onSubmit={handleRecordAdvance}>
                  <label className="field">
                    Avance encaissee (TND)
                    <input
                      max={
                        Number(selectedOrder.totalTnd) -
                        Number(selectedOrder.advanceBalanceTnd)
                      }
                      min="0.001"
                      onChange={(event) => setAdvanceAmount(event.target.value)}
                      required
                      step="0.001"
                      type="number"
                      value={advanceAmount}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    Encaisser l'avance
                  </button>
                </form>
              ) : null}

              {canCompleteOrders &&
              completableStatuses.includes(selectedOrder.status) ? (
                <form className="inline-form" onSubmit={handleComplete}>
                  <label className="field">
                    Paiement a la remise (TND)
                    <input
                      min="0"
                      onChange={(event) =>
                        setCompletionPayment(event.target.value)
                      }
                      placeholder={String(
                        Number(selectedOrder.totalTnd) -
                          Number(selectedOrder.advanceBalanceTnd),
                      )}
                      step="0.001"
                      type="number"
                      value={completionPayment}
                    />
                  </label>
                  <p className="status-muted">
                    Laissez vide pour solder la commande. Tout reste impaye
                    devient une creance client.
                  </p>
                  <button
                    className="primary-button"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    Terminer et creer la vente
                  </button>
                </form>
              ) : null}

              {canCancelOrders &&
              selectedOrder.status !== "COMPLETED" &&
              selectedOrder.status !== "CANCELLED" ? (
                <form className="inline-form" onSubmit={handleCancel}>
                  <label className="field">
                    Motif d'annulation
                    <input
                      onChange={(event) =>
                        setCancellation({
                          ...cancellation,
                          reason: event.target.value,
                        })
                      }
                      required
                      value={cancellation.reason}
                    />
                  </label>

                  {heldAdvance > 0 ? (
                    <label className="field">
                      Traitement de l'avance
                      <select
                        onChange={(event) =>
                          setCancellation({
                            ...cancellation,
                            advanceDisposition: event.target.value as
                              AdvanceDisposition | "",
                          })
                        }
                        required
                        value={cancellation.advanceDisposition}
                      >
                        <option value="">Choisissez une option</option>
                        <option value="REFUNDED">Rembourser le client</option>
                        <option value="CREDITED">
                          Conserver en credit client
                        </option>
                      </select>
                    </label>
                  ) : null}

                  <button
                    className="secondary-button"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    Annuler la commande
                  </button>
                </form>
              ) : null}

              {selectedOrder.lines?.length ? (
                <ul className="record-list">
                  {selectedOrder.lines.map((line) => (
                    <li className="metric-row" key={line.id}>
                      <span>
                        {line.productNameSnapshot} · {line.quantity}{" "}
                        {line.unitNameSnapshot}
                      </span>
                      <strong>{formatTnd(line.lineTotalTnd)}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatTnd(value: string): string {
  return new Intl.NumberFormat("fr-TN", {
    style: "currency",
    currency: "TND",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  }).format(new Date(value));
}

function emptyPage<TItem>() {
  return {
    items: [] as TItem[],
    page: 1,
    pageSize: 25,
    total: 0,
    pageCount: 0,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operation impossible.";
}

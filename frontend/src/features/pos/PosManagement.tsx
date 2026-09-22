import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "../auth/authApi";
import {
  closePosSession,
  getCurrentPosSession,
  getPosCustomers,
  getPosProducts,
  openPosSession,
  postPaidSale,
  type PosProduct,
  type PosSession,
} from "./posApi";
import type { Customer } from "../customers/customersApi";
import { createOrder } from "../orders/ordersApi";

interface PosManagementProps {
  user: CurrentUser;
}

interface CartLine {
  product: PosProduct;
  quantity: string;
}

export function PosManagement({ user }: PosManagementProps) {
  const permissions = useMemo(
    () => new Set(user.effectivePermissions),
    [user.effectivePermissions],
  );
  const canAccess = permissions.has("pos.access");
  const canOpenSession = permissions.has("pos.open_session");
  const canCloseSession = permissions.has("pos.close_session");
  const canSell = permissions.has("pos.sell");
  const canCreditSale = permissions.has("pos.credit_sale");
  const canCreateOrders = permissions.has("orders.create");
  const [cartMode, setCartMode] = useState<"SALE" | "ORDER">("SALE");
  const [requestedFulfillmentAt, setRequestedFulfillmentAt] = useState("");
  const [session, setSession] = useState<PosSession | null>(null);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [paidAmountTnd, setPaidAmountTnd] = useState("");
  const [openingCashTnd, setOpeningCashTnd] = useState("0.000");
  const [countedCashTnd, setCountedCashTnd] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!canAccess) {
      return;
    }

    void refreshWorkspace();
  }, [canAccess]);

  async function refreshWorkspace(nextSearch = search) {
    setError("");
    const [nextSession, productPage, customerPage] = await Promise.all([
      getCurrentPosSession(),
      getPosProducts(nextSearch),
      canCreditSale || canCreateOrders
        ? getPosCustomers(customerSearch)
        : Promise.resolve(emptyPage<Customer>()),
    ]);
    setSession(nextSession);
    setProducts(productPage.items);
    setCustomers(customerPage.items);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await refreshWorkspace(search);
  }

  async function handleCustomerSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const customerPage = await getPosCustomers(customerSearch);
      setCustomers(customerPage.items);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function handleOpenSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setStatus("");

    try {
      setSession(await openPosSession({ openingCashTnd }));
      setStatus("Session ouverte.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCloseSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setStatus("");

    try {
      setSession(await closePosSession(session.id, { countedCashTnd }));
      setCountedCashTnd("");
      setStatus("Session fermee.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePostSale() {
    if (!session || cart.length === 0) {
      return;
    }

    const requestedPaidAmountTnd = paidAmountTnd.trim();
    const willCreateCredit =
      requestedPaidAmountTnd !== "" &&
      Number(requestedPaidAmountTnd) < Number(totalTnd);

    if (willCreateCredit && !selectedCustomerId) {
      setError("Un client est obligatoire pour une vente a credit.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setStatus("");

    try {
      const sale = await postPaidSale({
        sessionId: session.id,
        customerId: selectedCustomerId || undefined,
        paidAmountTnd: requestedPaidAmountTnd || undefined,
        lines: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      });
      setCart([]);
      setPaidAmountTnd("");
      setStatus(
        sale.remainingDueTnd === "0.000"
          ? `Vente encaissee: ${formatTnd(sale.totalTnd)}.`
          : `Vente enregistree: ${formatTnd(sale.remainingDueTnd)} restant.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  /// ORD-003 and ORD-006: an order needs a registered customer and creates no
  /// sale, revenue, or stock movement.
  async function handleCreateOrder() {
    if (cart.length === 0 || !selectedCustomerId || !requestedFulfillmentAt) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setStatus("");

    try {
      const order = await createOrder({
        customerId: selectedCustomerId,
        requestedFulfillmentAt: new Date(requestedFulfillmentAt).toISOString(),
        lines: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      });
      setCart([]);
      setRequestedFulfillmentAt("");
      setCartMode("SALE");
      setStatus(
        `Commande ${order.reference} enregistree pour ${formatTnd(order.totalTnd)}. Aucune vente creee.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  function addProduct(product: PosProduct) {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);

      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? {
                ...line,
                quantity: (Number(line.quantity) + 1).toString(),
              }
            : line,
        );
      }

      return [...current, { product, quantity: "1" }];
    });
  }

  function updateQuantity(productId: string, quantity: string) {
    setCart((current) =>
      current.map((line) =>
        line.product.id === productId ? { ...line, quantity } : line,
      ),
    );
  }

  function removeProduct(productId: string) {
    setCart((current) =>
      current.filter((line) => line.product.id !== productId),
    );
  }

  const totalTnd = cart
    .reduce(
      (total, line) =>
        total + Number(line.quantity || 0) * Number(line.product.salePriceTnd),
      0,
    )
    .toFixed(3);
  const remainingDueTnd = Math.max(
    0,
    Number(totalTnd) -
      Number(paidAmountTnd.trim() === "" ? totalTnd : paidAmountTnd),
  ).toFixed(3);
  const paymentExceedsTotal =
    paidAmountTnd.trim() !== "" && Number(paidAmountTnd) > Number(totalTnd);
  const creditRequiresCustomer =
    paidAmountTnd.trim() !== "" &&
    Number(paidAmountTnd) < Number(totalTnd) &&
    !selectedCustomerId;

  if (!canAccess) {
    return (
      <section className="panel" aria-labelledby="pos-title">
        <h2 id="pos-title">Caisse</h2>
        <p role="alert">Acces caisse non autorise.</p>
      </section>
    );
  }

  return (
    <section className="pos-workspace" aria-labelledby="pos-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Caisse</p>
          <h2 id="pos-title">Vente directe</h2>
        </div>
        <strong
          className={
            session?.status === "OPEN" ? "status-active" : "status-muted"
          }
        >
          {session?.status === "OPEN" ? "Ouverte" : "Fermee"}
        </strong>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {status ? <p className="status-active">{status}</p> : null}

      <div className="pos-grid">
        <div className="panel">
          <div className="panel-heading">
            <h3>Session</h3>
            {session ? <span>{formatDateTime(session.openedAt)}</span> : null}
          </div>

          {session?.status === "OPEN" ? (
            <>
              <div className="metric-row">
                <span>Fond initial</span>
                <strong>{formatTnd(session.openingCashTnd)}</strong>
              </div>
              {canCloseSession ? (
                <form className="inline-form" onSubmit={handleCloseSession}>
                  <label className="field">
                    Comptage caisse
                    <input
                      inputMode="decimal"
                      min="0"
                      onChange={(event) =>
                        setCountedCashTnd(event.target.value)
                      }
                      required
                      step="0.001"
                      type="number"
                      value={countedCashTnd}
                    />
                  </label>
                  <button disabled={isSubmitting} type="submit">
                    Fermer
                  </button>
                </form>
              ) : null}
            </>
          ) : canOpenSession ? (
            <form className="inline-form" onSubmit={handleOpenSession}>
              <label className="field">
                Fond initial
                <input
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setOpeningCashTnd(event.target.value)}
                  required
                  step="0.001"
                  type="number"
                  value={openingCashTnd}
                />
              </label>
              <button disabled={isSubmitting} type="submit">
                Ouvrir
              </button>
            </form>
          ) : (
            <p role="alert">Ouverture de caisse non autorisee.</p>
          )}

          {session?.status === "CLOSED" ? (
            <dl>
              <div>
                <dt>Espece attendue</dt>
                <dd>{formatTnd(session.expectedCashTnd ?? "0")}</dd>
              </div>
              <div>
                <dt>Ecart</dt>
                <dd>{formatTnd(session.cashDifferenceTnd ?? "0")}</dd>
              </div>
            </dl>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h3>Produits</h3>
            <span>{products.length}</span>
          </div>
          <form className="inline-form" onSubmit={handleSearch}>
            <label className="field">
              Recherche
              <input
                onChange={(event) => setSearch(event.target.value)}
                type="search"
                value={search}
              />
            </label>
            <button className="secondary-button" type="submit">
              Rechercher
            </button>
          </form>
          <div className="item-list">
            {products.map((product) => (
              <button
                className="list-button"
                key={product.id}
                onClick={() => addProduct(product)}
                type="button"
              >
                <span>
                  <strong>{product.name}</strong>
                  <small>
                    {product.category.name} - {product.baseUnit.name}
                  </small>
                </span>
                <strong>{formatTnd(product.salePriceTnd)}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h3>Panier</h3>
            <span>{cart.length}</span>
          </div>

          <div className="cart-lines">
            {cart.length === 0 ? (
              <p className="status-muted">Aucun produit selectionne.</p>
            ) : (
              cart.map((line) => (
                <div className="cart-line" key={line.product.id}>
                  <div>
                    <strong>{line.product.name}</strong>
                    <small>{formatTnd(line.product.salePriceTnd)}</small>
                  </div>
                  <input
                    aria-label={`Quantite ${line.product.name}`}
                    inputMode="decimal"
                    min="0.000001"
                    onChange={(event) =>
                      updateQuantity(line.product.id, event.target.value)
                    }
                    required
                    step="0.001"
                    type="number"
                    value={line.quantity}
                  />
                  <button
                    className="secondary-button"
                    onClick={() => removeProduct(line.product.id)}
                    type="button"
                  >
                    Retirer
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="metric-row">
            <span>Total</span>
            <strong>{formatTnd(totalTnd)}</strong>
          </div>

          {/* ORD-001: the same cart becomes either an immediate sale or an
              order fulfilled later. */}
          {canCreateOrders ? (
            <div
              className="mode-switch"
              role="group"
              aria-label="Type d'operation"
            >
              <button
                aria-pressed={cartMode === "SALE"}
                className="chip-button"
                onClick={() => setCartMode("SALE")}
                type="button"
              >
                Vente immediate
              </button>
              <button
                aria-pressed={cartMode === "ORDER"}
                className="chip-button"
                onClick={() => setCartMode("ORDER")}
                type="button"
              >
                Commande pour plus tard
              </button>
            </div>
          ) : null}

          {cartMode === "ORDER" ? (
            <div className="credit-sale-box">
              <label className="field">
                Client enregistre
                <select
                  onChange={(event) =>
                    setSelectedCustomerId(event.target.value)
                  }
                  required
                  value={selectedCustomerId}
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
                    setRequestedFulfillmentAt(event.target.value)
                  }
                  required
                  type="datetime-local"
                  value={requestedFulfillmentAt}
                />
              </label>
              <p className="status-muted">
                Une commande ne cree ni vente, ni chiffre d'affaires, ni
                mouvement de stock. L'acompte se saisit dans le module
                Commandes.
              </p>
              {!selectedCustomerId ? (
                <p role="alert">
                  Un client enregistre est obligatoire pour une commande.
                </p>
              ) : null}
              <button
                disabled={
                  isSubmitting ||
                  cart.length === 0 ||
                  !selectedCustomerId ||
                  !requestedFulfillmentAt
                }
                onClick={handleCreateOrder}
                type="button"
              >
                Enregistrer la commande
              </button>
            </div>
          ) : null}

          {cartMode === "SALE" && canCreditSale ? (
            <div className="credit-sale-box">
              <form className="inline-form" onSubmit={handleCustomerSearch}>
                <label className="field">
                  Client
                  <input
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="Nom ou telephone"
                    type="search"
                    value={customerSearch}
                  />
                </label>
                <button className="secondary-button" type="submit">
                  Chercher
                </button>
              </form>
              <label className="field">
                Client enregistre
                <select
                  onChange={(event) =>
                    setSelectedCustomerId(event.target.value)
                  }
                  value={selectedCustomerId}
                >
                  <option value="">Vente anonyme</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Montant encaisse
                <input
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setPaidAmountTnd(event.target.value)}
                  placeholder={totalTnd}
                  step="0.001"
                  type="number"
                  value={paidAmountTnd}
                />
              </label>
              <div className="metric-row">
                <span>Reste a payer</span>
                <strong>{formatTnd(remainingDueTnd)}</strong>
              </div>
              {creditRequiresCustomer ? (
                <p role="alert">
                  Selectionnez un client pour garder un reste a payer.
                </p>
              ) : null}
              {paymentExceedsTotal ? (
                <p role="alert">Le paiement ne peut pas depasser le total.</p>
              ) : null}
            </div>
          ) : null}
          {cartMode === "SALE" ? (
            <button
              disabled={
                isSubmitting ||
                !session ||
                session.status !== "OPEN" ||
                !canSell ||
                cart.length === 0 ||
                paymentExceedsTotal ||
                creditRequiresCustomer
              }
              onClick={handlePostSale}
              type="button"
            >
              Encaisser
            </button>
          ) : null}
          {cartMode === "SALE" && !canSell ? (
            <p role="alert">Vente non autorisee.</p>
          ) : null}
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operation impossible.";
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

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "../auth/authApi";
import {
  closePosSession,
  getCurrentPosSession,
  getPosProducts,
  openPosSession,
  postPaidSale,
  type PosProduct,
  type PosSession,
} from "./posApi";

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
  const [session, setSession] = useState<PosSession | null>(null);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
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
    const [nextSession, productPage] = await Promise.all([
      getCurrentPosSession(),
      getPosProducts(nextSearch),
    ]);
    setSession(nextSession);
    setProducts(productPage.items);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await refreshWorkspace(search);
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

    setIsSubmitting(true);
    setError("");
    setStatus("");

    try {
      const sale = await postPaidSale({
        sessionId: session.id,
        lines: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      });
      setCart([]);
      setStatus(`Vente encaissee: ${formatTnd(sale.totalTnd)}.`);
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
          <button
            disabled={
              isSubmitting ||
              !session ||
              session.status !== "OPEN" ||
              !canSell ||
              cart.length === 0
            }
            onClick={handlePostSale}
            type="button"
          >
            Encaisser
          </button>
          {!canSell ? <p role="alert">Vente non autorisee.</p> : null}
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

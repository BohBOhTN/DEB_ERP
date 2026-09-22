import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "../auth/authApi";
import { getPosProducts, type PosProduct } from "../pos/posApi";
import {
  createDistributor,
  createDistributorPayment,
  getCustody,
  getDispatches,
  getDistributorBalances,
  getDistributors,
  postDirectSale,
  postDispatch,
  postSettlement,
  updateDistributor,
  type Custody,
  type Dispatch,
  type Distributor,
  type DistributorBalance,
} from "./distributionApi";

interface DistributionManagementProps {
  user: CurrentUser;
}

type DistributionTab =
  "distributors" | "direct-sales" | "consignment" | "balances";

interface CartLine {
  productId: string;
  quantity: string;
  unitPriceTnd: string;
}

/// One row of the settlement form, keyed by dispatch line.
interface SettlementDraft {
  soldQuantity: string;
  returnedQuantity: string;
  unaccountedQuantity: string;
  unitPriceTnd: string;
}

export function DistributionManagement({ user }: DistributionManagementProps) {
  const permissions = useMemo(
    () => new Set(user.effectivePermissions),
    [user.effectivePermissions],
  );
  const canViewDistributors = permissions.has("distributors.view");
  const canCreateDistributors = permissions.has("distributors.create");
  const canUpdateDistributors = permissions.has("distributors.update");
  const canDirectSell = permissions.has("distribution.direct_sale");
  const canDispatch = permissions.has("distribution.dispatch");
  const canSettle = permissions.has("distribution.settle");
  const canViewCustody = permissions.has("distribution.custody.view");
  const canViewBalances = permissions.has("distribution.balances.view");
  const canCreatePayments = permissions.has("distributor_payments.create");

  const visibleTabs = [
    ...(canViewDistributors || canCreateDistributors
      ? [{ id: "distributors" as const, label: "Distributeurs" }]
      : []),
    ...(canDirectSell
      ? [{ id: "direct-sales" as const, label: "Ventes directes" }]
      : []),
    ...(canViewCustody || canDispatch
      ? [{ id: "consignment" as const, label: "Consignation" }]
      : []),
    ...(canViewBalances || canCreatePayments
      ? [{ id: "balances" as const, label: "Soldes" }]
      : []),
  ];

  const [activeTab, setActiveTab] = useState<DistributionTab>(
    visibleTabs[0]?.id ?? "distributors",
  );
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [custody, setCustody] = useState<Custody | null>(null);
  const [balances, setBalances] = useState<DistributorBalance[]>([]);
  const [distributorName, setDistributorName] = useState("");
  const [selectedDistributorId, setSelectedDistributorId] = useState("");
  const [saleCart, setSaleCart] = useState<CartLine[]>([]);
  const [salePaidAmount, setSalePaidAmount] = useState("");
  const [dispatchCart, setDispatchCart] = useState<CartLine[]>([]);
  const [selectedDispatchId, setSelectedDispatchId] = useState("");
  const [settlementDrafts, setSettlementDrafts] = useState<
    Record<string, SettlementDraft>
  >({});
  const [settlementPaidAmount, setSettlementPaidAmount] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    distributorId: "",
    amountTnd: "",
    reference: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void refresh();
  }, [activeTab]);

  async function refresh() {
    setError("");
    setIsLoading(true);

    try {
      const [
        distributorPage,
        productPage,
        dispatchPage,
        custodyResult,
        balancePage,
      ] = await Promise.all([
        canViewDistributors || canDirectSell || canDispatch
          ? getDistributors()
          : Promise.resolve(emptyPage<Distributor>()),
        canDirectSell || canDispatch
          ? getPosProducts()
          : Promise.resolve(emptyPage<PosProduct>()),
        canViewCustody
          ? getDispatches({ status: "OPEN" })
          : Promise.resolve(emptyPage<Dispatch>()),
        canViewCustody
          ? getCustody()
          : Promise.resolve({ items: [], discrepancies: [] } as Custody),
        canViewBalances
          ? getDistributorBalances()
          : Promise.resolve(emptyPage<DistributorBalance>()),
      ]);
      setDistributors(distributorPage.items);
      setProducts(productPage.items);
      setDispatches(dispatchPage.items);
      setCustody(custodyResult);
      setBalances(balancePage.items);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function runCommand(action: () => Promise<string>) {
    setIsSubmitting(true);
    setError("");
    setNotice("");

    try {
      setNotice(await action());
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateDistributor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runCommand(async () => {
      await createDistributor({ name: distributorName });
      setDistributorName("");
      return "Distributeur cree.";
    });
  }

  async function handleToggleDistributor(distributor: Distributor) {
    await runCommand(async () => {
      await updateDistributor(distributor.id, {
        version: distributor.version,
        isActive: !distributor.isActive,
      });
      return distributor.isActive
        ? "Distributeur desactive."
        : "Distributeur active.";
    });
  }

  async function handleDirectSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saleCart.length === 0) {
      setError("Ajoutez au moins un produit a la vente.");
      return;
    }

    await runCommand(async () => {
      const sale = await postDirectSale({
        distributorId: selectedDistributorId,
        soldAt: new Date().toISOString(),
        ...(salePaidAmount ? { paidAmountTnd: salePaidAmount } : {}),
        lines: saleCart,
      });
      setSaleCart([]);
      setSalePaidAmount("");
      return `Vente ${sale.reference} enregistree. Reste a payer ${formatTnd(sale.remainingDueTnd)}.`;
    });
  }

  async function handleDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (dispatchCart.length === 0) {
      setError("Ajoutez au moins un produit au bon de livraison.");
      return;
    }

    await runCommand(async () => {
      const dispatch = await postDispatch({
        distributorId: selectedDistributorId,
        dispatchedAt: new Date().toISOString(),
        lines: dispatchCart.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
      });
      setDispatchCart([]);
      return `Bon ${dispatch.reference} enregistre. Aucune vente n'est creee.`;
    });
  }

  async function handleSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const dispatch = dispatches.find((item) => item.id === selectedDispatchId);

    if (!dispatch) {
      return;
    }

    const lines = dispatch.lines
      .map((line) => ({ line, draft: settlementDrafts[line.id] }))
      .filter(({ draft }) => draft && hasQuantity(draft))
      .map(({ line, draft }) => ({
        dispatchLineId: line.id,
        soldQuantity: draft.soldQuantity || "0",
        returnedQuantity: draft.returnedQuantity || "0",
        unaccountedQuantity: draft.unaccountedQuantity || "0",
        unitPriceTnd: draft.unitPriceTnd || "0",
      }));

    if (lines.length === 0) {
      setError(
        "Indiquez au moins une quantite vendue, retournee ou manquante.",
      );
      return;
    }

    await runCommand(async () => {
      const settlement = await postSettlement({
        dispatchId: dispatch.id,
        settledAt: new Date().toISOString(),
        ...(settlementPaidAmount
          ? { paidAmountTnd: settlementPaidAmount }
          : {}),
        lines,
      });
      setSettlementDrafts({});
      setSettlementPaidAmount("");
      setSelectedDispatchId("");
      return `Reglement ${settlement.reference} enregistre pour ${formatTnd(settlement.totalTnd)}.`;
    });
  }

  async function handlePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runCommand(async () => {
      await createDistributorPayment({
        distributorId: paymentForm.distributorId,
        paidAt: new Date().toISOString(),
        amountTnd: paymentForm.amountTnd,
        ...(paymentForm.reference ? { reference: paymentForm.reference } : {}),
      });
      setPaymentForm({ distributorId: "", amountTnd: "", reference: "" });
      return "Paiement distributeur enregistre.";
    });
  }

  if (visibleTabs.length === 0) {
    return (
      <section className="distribution-workspace" aria-labelledby="dist-title">
        <h2 id="dist-title">Distribution</h2>
        <p className="status-muted">
          Vous n'avez pas acces au module distribution.
        </p>
      </section>
    );
  }

  const selectedDispatch = dispatches.find(
    (item) => item.id === selectedDispatchId,
  );

  return (
    <section className="distribution-workspace" aria-labelledby="dist-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Distribution</p>
          <h2 id="dist-title">Distributeurs et consignation</h2>
        </div>
        <span className="permission-count">{distributors.length}</span>
      </div>

      <nav className="tab-row" aria-label="Distribution">
        {visibleTabs.map((tab) => (
          <button
            aria-pressed={activeTab === tab.id}
            className="module-button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p className="status-active">{notice}</p> : null}
      {isLoading ? <p className="status-muted">Chargement...</p> : null}

      {activeTab === "distributors" ? (
        <div className="distribution-grid">
          {canCreateDistributors ? (
            <div className="panel">
              <div className="panel-heading">
                <h3>Nouveau distributeur</h3>
              </div>
              <form className="inline-form" onSubmit={handleCreateDistributor}>
                <label className="field">
                  Nom
                  <input
                    onChange={(event) => setDistributorName(event.target.value)}
                    required
                    value={distributorName}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={isSubmitting}
                  type="submit"
                >
                  Creer le distributeur
                </button>
              </form>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-heading">
              <h3>Distributeurs</h3>
              <span>{distributors.length}</span>
            </div>
            {distributors.length === 0 ? (
              <p className="status-muted">Aucun distributeur.</p>
            ) : (
              <ul className="record-list">
                {distributors.map((distributor) => (
                  <li className="metric-row" key={distributor.id}>
                    <span>
                      {distributor.name}
                      {distributor.isActive ? "" : " (inactif)"}
                    </span>
                    {canUpdateDistributors ? (
                      <button
                        className="secondary-button"
                        disabled={isSubmitting}
                        onClick={() =>
                          void handleToggleDistributor(distributor)
                        }
                        type="button"
                      >
                        {distributor.isActive ? "Desactiver" : "Activer"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === "direct-sales" ? (
        <div className="panel">
          <div className="panel-heading">
            <h3>Vente directe</h3>
          </div>
          <form className="inline-form" onSubmit={handleDirectSale}>
            <DistributorPicker
              distributors={distributors}
              onChange={setSelectedDistributorId}
              value={selectedDistributorId}
            />
            <LineBuilder
              cart={saleCart}
              onChange={setSaleCart}
              products={products}
              withPrice
            />
            <label className="field">
              Montant encaisse (TND)
              <input
                min="0"
                onChange={(event) => setSalePaidAmount(event.target.value)}
                placeholder={cartTotal(saleCart)}
                step="0.001"
                type="number"
                value={salePaidAmount}
              />
            </label>
            <div className="metric-row">
              <span>Total estime</span>
              <strong>{formatTnd(cartTotal(saleCart))}</strong>
            </div>
            <p className="status-muted">
              Le prix distributeur est saisi par ligne. Le total definitif est
              calcule par le serveur.
            </p>
            <button
              className="primary-button"
              disabled={
                isSubmitting || !selectedDistributorId || saleCart.length === 0
              }
              type="submit"
            >
              Enregistrer la vente
            </button>
          </form>
        </div>
      ) : null}

      {activeTab === "consignment" ? (
        <div className="distribution-grid">
          {canDispatch ? (
            <div className="panel">
              <div className="panel-heading">
                <h3>Nouveau bon de livraison</h3>
              </div>
              <form className="inline-form" onSubmit={handleDispatch}>
                <DistributorPicker
                  distributors={distributors}
                  onChange={setSelectedDistributorId}
                  value={selectedDistributorId}
                />
                <LineBuilder
                  cart={dispatchCart}
                  onChange={setDispatchCart}
                  products={products}
                />
                <p className="status-muted">
                  Le depot transfere la garde uniquement. Aucune vente, dette ou
                  recette n'est creee.
                </p>
                <button
                  className="primary-button"
                  disabled={
                    isSubmitting ||
                    !selectedDistributorId ||
                    dispatchCart.length === 0
                  }
                  type="submit"
                >
                  Enregistrer le bon
                </button>
              </form>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-heading">
              <h3>Garde distributeur</h3>
              <span>{custody?.items.length ?? 0}</span>
            </div>
            {!custody || custody.items.length === 0 ? (
              <p className="status-muted">Aucune quantite en garde.</p>
            ) : (
              <ul className="record-list">
                {custody.items.map((line) => (
                  <li className="metric-row" key={line.id}>
                    <span>
                      {line.distributorName} · {line.productNameSnapshot}
                      <small>
                        {line.dispatchReference} ·{" "}
                        {formatDate(line.dispatchedAt)}
                      </small>
                    </span>
                    <strong>
                      {line.stillHeldQuantity} {line.unitNameSnapshot}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
            {custody && custody.discrepancies.length > 0 ? (
              <p role="status">
                {custody.discrepancies.length} ecart(s) non justifie(s). Aucune
                dette n'est creee automatiquement.
              </p>
            ) : null}
          </div>

          {canSettle ? (
            <div className="panel">
              <div className="panel-heading">
                <h3>Reglement</h3>
              </div>
              <form className="inline-form" onSubmit={handleSettlement}>
                <label className="field">
                  Bon de livraison
                  <select
                    onChange={(event) => {
                      setSelectedDispatchId(event.target.value);
                      setSettlementDrafts({});
                    }}
                    value={selectedDispatchId}
                  >
                    <option value="">Selectionnez un bon</option>
                    {dispatches.map((dispatch) => (
                      <option key={dispatch.id} value={dispatch.id}>
                        {dispatch.reference} ·{" "}
                        {dispatch.distributor?.name ?? "Distributeur"}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedDispatch?.lines.map((line) => (
                  <fieldset className="settlement-line" key={line.id}>
                    <legend>
                      {line.productNameSnapshot} · encore detenu{" "}
                      {line.stillHeldQuantity}
                    </legend>
                    <label className="field">
                      Vendu
                      <input
                        min="0"
                        onChange={(event) =>
                          updateDraft(
                            line.id,
                            "soldQuantity",
                            event.target.value,
                          )
                        }
                        step="0.001"
                        type="number"
                        value={settlementDrafts[line.id]?.soldQuantity ?? ""}
                      />
                    </label>
                    <label className="field">
                      Retourne
                      <input
                        min="0"
                        onChange={(event) =>
                          updateDraft(
                            line.id,
                            "returnedQuantity",
                            event.target.value,
                          )
                        }
                        step="0.001"
                        type="number"
                        value={
                          settlementDrafts[line.id]?.returnedQuantity ?? ""
                        }
                      />
                    </label>
                    <label className="field">
                      Manquant
                      <input
                        min="0"
                        onChange={(event) =>
                          updateDraft(
                            line.id,
                            "unaccountedQuantity",
                            event.target.value,
                          )
                        }
                        step="0.001"
                        type="number"
                        value={
                          settlementDrafts[line.id]?.unaccountedQuantity ?? ""
                        }
                      />
                    </label>
                    <label className="field">
                      Prix unitaire (TND)
                      <input
                        min="0"
                        onChange={(event) =>
                          updateDraft(
                            line.id,
                            "unitPriceTnd",
                            event.target.value,
                          )
                        }
                        step="0.001"
                        type="number"
                        value={settlementDrafts[line.id]?.unitPriceTnd ?? ""}
                      />
                    </label>
                  </fieldset>
                ))}

                {selectedDispatch ? (
                  <>
                    <label className="field">
                      Montant encaisse (TND)
                      <input
                        min="0"
                        onChange={(event) =>
                          setSettlementPaidAmount(event.target.value)
                        }
                        step="0.001"
                        type="number"
                        value={settlementPaidAmount}
                      />
                    </label>
                    <p className="status-muted">
                      Seules les quantites vendues deviennent une recette. Les
                      retours reviennent en stock principal et les manquants
                      restent un ecart.
                    </p>
                    <button
                      className="primary-button"
                      disabled={isSubmitting}
                      type="submit"
                    >
                      Enregistrer le reglement
                    </button>
                  </>
                ) : (
                  <p className="status-muted">Selectionnez un bon.</p>
                )}
              </form>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "balances" ? (
        <div className="distribution-grid">
          <div className="panel">
            <div className="panel-heading">
              <h3>Soldes distributeurs</h3>
              <span>{balances.length}</span>
            </div>
            {balances.length === 0 ? (
              <p className="status-muted">Aucun solde.</p>
            ) : (
              <ul className="record-list">
                {balances.map((balance) => (
                  <li className="metric-row" key={balance.distributor.id}>
                    <span>{balance.distributor.name}</span>
                    <strong>{formatTnd(balance.balanceTnd)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canCreatePayments ? (
            <div className="panel">
              <div className="panel-heading">
                <h3>Paiement distributeur</h3>
              </div>
              <form className="inline-form" onSubmit={handlePayment}>
                <label className="field">
                  Distributeur
                  <select
                    onChange={(event) =>
                      setPaymentForm({
                        ...paymentForm,
                        distributorId: event.target.value,
                      })
                    }
                    required
                    value={paymentForm.distributorId}
                  >
                    <option value="">Selectionnez un distributeur</option>
                    {distributors.map((distributor) => (
                      <option key={distributor.id} value={distributor.id}>
                        {distributor.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Montant (TND)
                  <input
                    min="0.001"
                    onChange={(event) =>
                      setPaymentForm({
                        ...paymentForm,
                        amountTnd: event.target.value,
                      })
                    }
                    required
                    step="0.001"
                    type="number"
                    value={paymentForm.amountTnd}
                  />
                </label>
                <label className="field">
                  Reference
                  <input
                    onChange={(event) =>
                      setPaymentForm({
                        ...paymentForm,
                        reference: event.target.value,
                      })
                    }
                    value={paymentForm.reference}
                  />
                </label>
                <p className="status-muted">
                  Un paiement reduit la creance sans modifier la garde ni creer
                  de recette.
                </p>
                <button
                  className="primary-button"
                  disabled={isSubmitting}
                  type="submit"
                >
                  Enregistrer le paiement
                </button>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );

  function updateDraft(
    lineId: string,
    field: keyof SettlementDraft,
    value: string,
  ) {
    setSettlementDrafts((current) => {
      const existing: SettlementDraft = current[lineId] ?? {
        soldQuantity: "",
        returnedQuantity: "",
        unaccountedQuantity: "",
        unitPriceTnd: "",
      };

      return {
        ...current,
        [lineId]: { ...existing, [field]: value },
      };
    });
  }
}

function DistributorPicker(props: {
  distributors: Distributor[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      Distributeur
      <select
        onChange={(event) => props.onChange(event.target.value)}
        required
        value={props.value}
      >
        <option value="">Selectionnez un distributeur</option>
        {props.distributors
          .filter((distributor) => distributor.isActive)
          .map((distributor) => (
            <option key={distributor.id} value={distributor.id}>
              {distributor.name}
            </option>
          ))}
      </select>
    </label>
  );
}

function LineBuilder(props: {
  cart: CartLine[];
  products: PosProduct[];
  onChange: (cart: CartLine[]) => void;
  withPrice?: boolean;
}) {
  return (
    <>
      <label className="field">
        Ajouter un produit
        <select
          onChange={(event) => {
            const productId = event.target.value;
            event.target.value = "";

            if (
              !productId ||
              props.cart.some((line) => line.productId === productId)
            ) {
              return;
            }

            const product = props.products.find(
              (item) => item.id === productId,
            );
            props.onChange([
              ...props.cart,
              {
                productId,
                quantity: "1",
                unitPriceTnd: product?.salePriceTnd ?? "0",
              },
            ]);
          }}
          value=""
        >
          <option value="">Selectionnez un produit</option>
          {props.products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>

      {props.cart.length === 0 ? (
        <p className="status-muted">Aucune ligne.</p>
      ) : (
        <ul className="record-list">
          {props.cart.map((line) => {
            const product = props.products.find(
              (item) => item.id === line.productId,
            );

            return (
              <li className="cart-line" key={line.productId}>
                <span>{product?.name ?? line.productId}</span>
                <input
                  aria-label={`Quantite ${product?.name ?? ""}`}
                  min="0.001"
                  onChange={(event) =>
                    props.onChange(
                      props.cart.map((item) =>
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
                {props.withPrice ? (
                  <input
                    aria-label={`Prix ${product?.name ?? ""}`}
                    min="0"
                    onChange={(event) =>
                      props.onChange(
                        props.cart.map((item) =>
                          item.productId === line.productId
                            ? { ...item, unitPriceTnd: event.target.value }
                            : item,
                        ),
                      )
                    }
                    step="0.001"
                    type="number"
                    value={line.unitPriceTnd}
                  />
                ) : null}
                <button
                  className="secondary-button"
                  onClick={() =>
                    props.onChange(
                      props.cart.filter(
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
    </>
  );
}

function hasQuantity(draft: SettlementDraft): boolean {
  return (
    Number(draft.soldQuantity || 0) > 0 ||
    Number(draft.returnedQuantity || 0) > 0 ||
    Number(draft.unaccountedQuantity || 0) > 0
  );
}

function cartTotal(cart: CartLine[]): string {
  return cart
    .reduce(
      (total, line) =>
        total + Number(line.quantity || 0) * Number(line.unitPriceTnd || 0),
      0,
    )
    .toFixed(3);
}

function formatTnd(value: string): string {
  return new Intl.NumberFormat("fr-TN", {
    style: "currency",
    currency: "TND",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    dateStyle: "short",
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

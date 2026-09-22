import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  getRawMaterials,
  getUnits,
  type RawMaterial,
  type Unit,
} from "../catalog/catalogApi";
import type { ApiError, CurrentUser } from "../auth/authApi";
import {
  cancelPurchase,
  createPurchase,
  createSupplierPayment,
  createSupplier,
  estimateLineTotal,
  estimatePurchaseTotal,
  getPurchases,
  getSupplierBalances,
  getSupplierPayments,
  getSupplierStatement,
  getSuppliers,
  postPurchase,
  unitOptionsForLine,
  updateSupplier,
  type Purchase,
  type PurchaseDraftLineInput,
  type PurchasePaymentTerms,
  type Supplier,
  type SupplierBalance,
  type SupplierPayment,
  type SupplierStatement,
} from "./procurementApi";

interface ProcurementManagementProps {
  user: CurrentUser;
}

type LoadState =
  | { status: "loading" }
  | {
      status: "loaded";
      suppliers: Supplier[];
      purchases: Purchase[];
      supplierBalances: SupplierBalance[];
      supplierPayments: SupplierPayment[];
      rawMaterials: RawMaterial[];
      units: Unit[];
    }
  | { status: "error"; message: string };

type ProcurementTab = "suppliers" | "purchases" | "balances" | "payments";

const emptyLine: PurchaseDraftLineInput = {
  rawMaterialId: "",
  enteredUnitId: "",
  enteredQuantity: "",
  unitPriceTnd: "",
};

export function ProcurementManagement({ user }: ProcurementManagementProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [activeTab, setActiveTab] = useState<ProcurementTab>("purchases");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    phone: "",
    address: "",
    taxIdentifier: "",
    notes: "",
  });
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: "",
    purchaseDate: new Date().toISOString().slice(0, 10),
    supplierReference: "",
    paymentTerms: "PARTIAL" as PurchasePaymentTerms,
    paidAmountTnd: "",
    dueDate: "",
    notes: "",
  });
  const [lines, setLines] = useState<PurchaseDraftLineInput[]>([
    { ...emptyLine },
  ]);
  const [statement, setStatement] = useState<SupplierStatement | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    supplierId: "",
    paidAt: new Date().toISOString().slice(0, 10),
    amountTnd: "",
    reference: "",
    notes: "",
    allocationPurchaseId: "",
    allocationAmountTnd: "",
  });

  const permissions = useMemo(
    () => new Set(user.effectivePermissions),
    [user.effectivePermissions],
  );
  const canViewSuppliers = permissions.has("suppliers.view");
  const canCreateSuppliers = permissions.has("suppliers.create");
  const canUpdateSuppliers = permissions.has("suppliers.update");
  const canViewPurchases = permissions.has("purchases.view");
  const canCreatePurchases = permissions.has("purchases.create");
  const canPostPurchases = permissions.has("purchases.post");
  const canCancelPurchases = permissions.has("purchases.cancel");
  const canViewSupplierBalances = permissions.has("supplier_balances.view");
  const canViewSupplierPayments = permissions.has("supplier_payments.view");
  const canCreateSupplierPayments = permissions.has("supplier_payments.create");
  const canLoadPurchaseInputs =
    permissions.has("raw_materials.view") && permissions.has("units.view");
  const visibleTabs = [
    ...(canViewPurchases
      ? [{ id: "purchases" as const, label: "Achats" }]
      : []),
    ...(canViewSupplierBalances
      ? [{ id: "balances" as const, label: "Soldes" }]
      : []),
    ...(canViewSupplierPayments || canCreateSupplierPayments
      ? [{ id: "payments" as const, label: "Paiements" }]
      : []),
    ...(canViewSuppliers
      ? [{ id: "suppliers" as const, label: "Fournisseurs" }]
      : []),
  ];

  useEffect(() => {
    if (
      !canViewSuppliers &&
      !canViewPurchases &&
      !canViewSupplierBalances &&
      !canViewSupplierPayments &&
      !canCreateSupplierPayments
    ) {
      setState({
        status: "error",
        message: "Vous n'avez pas acces aux achats.",
      });
      return;
    }

    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? "purchases");
    }

    let isMounted = true;
    refreshProcurement()
      .then((workspace) => {
        if (isMounted) {
          setState(workspace);
        }
      })
      .catch((error: ApiError) => {
        if (isMounted) {
          setState({
            status: "error",
            message:
              error.error?.message ?? "Impossible de charger les achats.",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    activeTab,
    canViewPurchases,
    canViewSuppliers,
    canViewSupplierBalances,
    canViewSupplierPayments,
    canCreateSupplierPayments,
    canLoadPurchaseInputs,
  ]);

  async function refreshProcurement(): Promise<LoadState> {
    const [
      suppliers,
      purchases,
      supplierBalances,
      supplierPayments,
      rawMaterials,
      units,
    ] = await Promise.all([
      canViewSuppliers
        ? getSuppliers()
        : Promise.resolve(emptyPage<Supplier>()),
      canViewPurchases
        ? getPurchases()
        : Promise.resolve(emptyPage<Purchase>()),
      canViewSupplierBalances
        ? getSupplierBalances()
        : Promise.resolve(emptyPage<SupplierBalance>()),
      canViewSupplierPayments
        ? getSupplierPayments()
        : Promise.resolve(emptyPage<SupplierPayment>()),
      canLoadPurchaseInputs
        ? getRawMaterials()
        : Promise.resolve(emptyPage<RawMaterial>()),
      canLoadPurchaseInputs ? getUnits() : Promise.resolve(emptyPage<Unit>()),
    ]);

    return {
      status: "loaded",
      suppliers: suppliers.items,
      purchases: purchases.items,
      supplierBalances: supplierBalances.items,
      supplierPayments: supplierPayments.items,
      rawMaterials: rawMaterials.items,
      units: units.items,
    };
  }

  async function reload() {
    setState(await refreshProcurement());
  }

  async function submit(action: () => Promise<void>) {
    setIsSubmitting(true);
    setNotice("");

    try {
      await action();
      await reload();
    } catch (error) {
      setNotice(readMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(async () => {
      await createSupplier(supplierForm);
      setSupplierForm({
        name: "",
        phone: "",
        address: "",
        taxIdentifier: "",
        notes: "",
      });
      setNotice("Fournisseur cree.");
    });
  }

  async function handleCreatePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(async () => {
      await createPurchase({
        ...purchaseForm,
        paidAmountTnd: purchaseForm.paidAmountTnd || "0",
        lines,
      });
      setPurchaseForm({
        supplierId: "",
        purchaseDate: new Date().toISOString().slice(0, 10),
        supplierReference: "",
        paymentTerms: "PARTIAL",
        paidAmountTnd: "",
        dueDate: "",
        notes: "",
      });
      setLines([{ ...emptyLine }]);
      setNotice("Achat brouillon cree.");
    });
  }

  async function handleCreateSupplierPayment(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    await submit(async () => {
      await createSupplierPayment({
        supplierId: paymentForm.supplierId,
        paidAt: paymentForm.paidAt,
        amountTnd: paymentForm.amountTnd,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
        allocations:
          paymentForm.allocationPurchaseId && paymentForm.allocationAmountTnd
            ? [
                {
                  purchaseId: paymentForm.allocationPurchaseId,
                  amountTnd: paymentForm.allocationAmountTnd,
                },
              ]
            : [],
      });
      setPaymentForm({
        supplierId: "",
        paidAt: new Date().toISOString().slice(0, 10),
        amountTnd: "",
        reference: "",
        notes: "",
        allocationPurchaseId: "",
        allocationAmountTnd: "",
      });
      setNotice("Paiement fournisseur enregistre.");
    });
  }

  async function loadStatement(supplierId: string) {
    setNotice("");
    try {
      setStatement(await getSupplierStatement(supplierId));
    } catch (error) {
      setNotice(readMessage(error));
    }
  }

  if (state.status === "loading") {
    return <p aria-live="polite">Chargement des achats...</p>;
  }

  if (state.status === "error") {
    return <p role="alert">{state.message}</p>;
  }

  const projectedTotal = estimatePurchaseTotal(lines, state.rawMaterials);

  return (
    <section
      className="procurement-workspace"
      aria-labelledby="procurement-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Achats</p>
          <h2 id="procurement-title">Fournisseurs et achats</h2>
        </div>
        <p className="permission-count">{state.purchases.length} achats</p>
      </div>

      <nav className="tab-row" aria-label="Achats">
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

      {notice ? <p role="status">{notice}</p> : null}

      {activeTab === "suppliers" ? (
        <section className="catalog-grid" aria-labelledby="suppliers-title">
          {canCreateSuppliers ? (
            <form className="panel inline-form" onSubmit={handleCreateSupplier}>
              <h3 id="suppliers-title">Nouveau fournisseur</h3>
              <input
                aria-label="Nom fournisseur"
                onChange={(event) =>
                  setSupplierForm({ ...supplierForm, name: event.target.value })
                }
                placeholder="Nom"
                required
                value={supplierForm.name}
              />
              <input
                aria-label="Telephone fournisseur"
                onChange={(event) =>
                  setSupplierForm({
                    ...supplierForm,
                    phone: event.target.value,
                  })
                }
                placeholder="Telephone"
                value={supplierForm.phone}
              />
              <input
                aria-label="Adresse fournisseur"
                onChange={(event) =>
                  setSupplierForm({
                    ...supplierForm,
                    address: event.target.value,
                  })
                }
                placeholder="Adresse"
                value={supplierForm.address}
              />
              <input
                aria-label="Identifiant fiscal"
                onChange={(event) =>
                  setSupplierForm({
                    ...supplierForm,
                    taxIdentifier: event.target.value,
                  })
                }
                placeholder="Identifiant fiscal"
                value={supplierForm.taxIdentifier}
              />
              <button disabled={isSubmitting} type="submit">
                Creer le fournisseur
              </button>
            </form>
          ) : null}
          <SupplierList
            canUpdate={canUpdateSuppliers}
            isSubmitting={isSubmitting}
            onToggle={(supplier) =>
              submit(async () => {
                await updateSupplier(supplier, {
                  isActive: !supplier.isActive,
                });
                setNotice(
                  supplier.isActive
                    ? "Fournisseur desactive."
                    : "Fournisseur active.",
                );
              })
            }
            suppliers={state.suppliers}
          />
        </section>
      ) : null}

      {activeTab === "purchases" ? (
        <section className="catalog-grid" aria-labelledby="purchases-title">
          {canCreatePurchases ? (
            <form className="panel inline-form" onSubmit={handleCreatePurchase}>
              <h3 id="purchases-title">Nouvel achat</h3>
              <select
                aria-label="Fournisseur"
                onChange={(event) =>
                  setPurchaseForm({
                    ...purchaseForm,
                    supplierId: event.target.value,
                  })
                }
                required
                value={purchaseForm.supplierId}
              >
                <option value="">Fournisseur</option>
                {state.suppliers
                  .filter((supplier) => supplier.isActive)
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
              </select>
              <input
                aria-label="Date achat"
                onChange={(event) =>
                  setPurchaseForm({
                    ...purchaseForm,
                    purchaseDate: event.target.value,
                  })
                }
                required
                type="date"
                value={purchaseForm.purchaseDate}
              />
              <input
                aria-label="Reference fournisseur"
                onChange={(event) =>
                  setPurchaseForm({
                    ...purchaseForm,
                    supplierReference: event.target.value,
                  })
                }
                placeholder="Reference"
                value={purchaseForm.supplierReference}
              />
              <PurchaseLinesEditor
                isLocked={!canLoadPurchaseInputs}
                lines={lines}
                rawMaterials={state.rawMaterials}
                units={state.units}
                onChange={setLines}
              />
              <div className="metric-row">
                <span>Total estime</span>
                <strong>{projectedTotal} TND</strong>
              </div>
              <select
                aria-label="Modalite de paiement"
                onChange={(event) =>
                  setPurchaseForm({
                    ...purchaseForm,
                    paymentTerms: event.target.value as PurchasePaymentTerms,
                    dueDate:
                      event.target.value === "PAID" ? "" : purchaseForm.dueDate,
                  })
                }
                value={purchaseForm.paymentTerms}
              >
                <option value="PAID">Paye</option>
                <option value="PARTIAL">Partiel</option>
                <option value="UNPAID">Non paye</option>
              </select>
              <input
                aria-label="Montant paye"
                inputMode="decimal"
                onChange={(event) =>
                  setPurchaseForm({
                    ...purchaseForm,
                    paidAmountTnd: event.target.value,
                  })
                }
                placeholder="Montant paye"
                required={purchaseForm.paymentTerms !== "UNPAID"}
                value={purchaseForm.paidAmountTnd}
              />
              {purchaseForm.paymentTerms !== "PAID" ? (
                <input
                  aria-label="Echeance"
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      dueDate: event.target.value,
                    })
                  }
                  required
                  type="date"
                  value={purchaseForm.dueDate}
                />
              ) : null}
              <button
                disabled={isSubmitting || !canLoadPurchaseInputs}
                type="submit"
              >
                Creer le brouillon
              </button>
            </form>
          ) : null}
          <PurchaseList
            canCancel={canCancelPurchases}
            canPost={canPostPurchases}
            isSubmitting={isSubmitting}
            onCancel={(purchase) =>
              submit(async () => {
                const reason = window.prompt("Raison d'annulation");
                if (!reason) {
                  return;
                }
                await cancelPurchase(purchase.id, reason);
                setNotice("Achat annule.");
              })
            }
            onPost={(purchase) =>
              submit(async () => {
                await postPurchase(purchase.id);
                setNotice("Achat confirme.");
              })
            }
            purchases={state.purchases}
          />
        </section>
      ) : null}

      {activeTab === "balances" ? (
        <section className="catalog-grid" aria-labelledby="balances-title">
          <SupplierBalanceList
            balances={state.supplierBalances}
            onStatement={loadStatement}
          />
          <SupplierStatementPanel statement={statement} />
        </section>
      ) : null}

      {activeTab === "payments" ? (
        <section className="catalog-grid" aria-labelledby="payments-title">
          {canCreateSupplierPayments ? (
            <form
              className="panel inline-form"
              onSubmit={handleCreateSupplierPayment}
            >
              <h3 id="payments-title">Nouveau paiement</h3>
              <select
                aria-label="Fournisseur a payer"
                onChange={(event) =>
                  setPaymentForm({
                    ...paymentForm,
                    supplierId: event.target.value,
                    allocationPurchaseId: "",
                  })
                }
                required
                value={paymentForm.supplierId}
              >
                <option value="">Fournisseur</option>
                {state.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              <input
                aria-label="Date paiement"
                onChange={(event) =>
                  setPaymentForm({ ...paymentForm, paidAt: event.target.value })
                }
                required
                type="date"
                value={paymentForm.paidAt}
              />
              <input
                aria-label="Montant paiement"
                inputMode="decimal"
                onChange={(event) =>
                  setPaymentForm({
                    ...paymentForm,
                    amountTnd: event.target.value,
                  })
                }
                placeholder="Montant TND"
                required
                value={paymentForm.amountTnd}
              />
              <select
                aria-label="Achat alloue"
                onChange={(event) =>
                  setPaymentForm({
                    ...paymentForm,
                    allocationPurchaseId: event.target.value,
                    allocationAmountTnd: event.target.value
                      ? paymentForm.amountTnd
                      : "",
                  })
                }
                value={paymentForm.allocationPurchaseId}
              >
                <option value="">Sans allocation</option>
                {state.purchases
                  .filter(
                    (purchase) =>
                      purchase.status === "POSTED" &&
                      purchase.supplierId === paymentForm.supplierId,
                  )
                  .map((purchase) => (
                    <option key={purchase.id} value={purchase.id}>
                      {purchase.supplier.name} · {purchase.totalTnd} TND
                    </option>
                  ))}
              </select>
              {paymentForm.allocationPurchaseId ? (
                <input
                  aria-label="Montant alloue"
                  inputMode="decimal"
                  onChange={(event) =>
                    setPaymentForm({
                      ...paymentForm,
                      allocationAmountTnd: event.target.value,
                    })
                  }
                  placeholder="Montant alloue"
                  required
                  value={paymentForm.allocationAmountTnd}
                />
              ) : null}
              <input
                aria-label="Reference paiement"
                onChange={(event) =>
                  setPaymentForm({
                    ...paymentForm,
                    reference: event.target.value,
                  })
                }
                placeholder="Reference"
                value={paymentForm.reference}
              />
              <button disabled={isSubmitting} type="submit">
                Enregistrer le paiement
              </button>
            </form>
          ) : null}
          <SupplierPaymentList payments={state.supplierPayments} />
        </section>
      ) : null}
    </section>
  );
}

function PurchaseLinesEditor({
  isLocked,
  lines,
  rawMaterials,
  units,
  onChange,
}: {
  isLocked: boolean;
  lines: PurchaseDraftLineInput[];
  rawMaterials: RawMaterial[];
  units: Unit[];
  onChange: (lines: PurchaseDraftLineInput[]) => void;
}) {
  if (isLocked) {
    return (
      <p className="warning-banner">
        Les matieres premieres et les unites sont requises.
      </p>
    );
  }

  return (
    <div className="line-editor">
      {lines.map((line, index) => {
        const options = unitOptionsForLine(line, rawMaterials, units);
        return (
          <fieldset key={index}>
            <legend>Ligne {index + 1}</legend>
            <select
              aria-label={`Matiere ligne ${index + 1}`}
              onChange={(event) => {
                const material = rawMaterials.find(
                  (item) => item.id === event.target.value,
                );
                updateLine(index, {
                  rawMaterialId: event.target.value,
                  enteredUnitId: material?.baseUnitId ?? "",
                });
              }}
              required
              value={line.rawMaterialId}
            >
              <option value="">Matiere premiere</option>
              {rawMaterials
                .filter((material) => material.isActive)
                .map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name}
                  </option>
                ))}
            </select>
            <select
              aria-label={`Unite ligne ${index + 1}`}
              onChange={(event) =>
                updateLine(index, { enteredUnitId: event.target.value })
              }
              required
              value={line.enteredUnitId}
            >
              <option value="">Unite achat</option>
              {options.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
            <input
              aria-label={`Quantite ligne ${index + 1}`}
              inputMode="decimal"
              onChange={(event) =>
                updateLine(index, { enteredQuantity: event.target.value })
              }
              placeholder="Quantite"
              required
              value={line.enteredQuantity}
            />
            <input
              aria-label={`Prix ligne ${index + 1}`}
              inputMode="decimal"
              onChange={(event) =>
                updateLine(index, { unitPriceTnd: event.target.value })
              }
              placeholder="Prix unitaire TND"
              required
              value={line.unitPriceTnd}
            />
            <div className="button-row">
              <span>{estimateLineTotal(line, rawMaterials)} TND</span>
              {lines.length > 1 ? (
                <button
                  className="secondary-button"
                  onClick={() =>
                    onChange(
                      lines.filter((_, lineIndex) => lineIndex !== index),
                    )
                  }
                  type="button"
                >
                  Retirer
                </button>
              ) : null}
            </div>
          </fieldset>
        );
      })}
      <button
        className="secondary-button"
        onClick={() => onChange([...lines, { ...emptyLine }])}
        type="button"
      >
        Ajouter une ligne
      </button>
    </div>
  );

  function updateLine(index: number, patch: Partial<PurchaseDraftLineInput>) {
    onChange(
      lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }
}

function SupplierList({
  suppliers,
  canUpdate,
  isSubmitting,
  onToggle,
}: {
  suppliers: Supplier[];
  canUpdate: boolean;
  isSubmitting: boolean;
  onToggle: (supplier: Supplier) => void;
}) {
  if (suppliers.length === 0) {
    return (
      <section className="panel">
        <p className="summary">Aucun fournisseur trouve.</p>
      </section>
    );
  }

  return (
    <section className="panel item-list" aria-label="Fournisseurs">
      {suppliers.map((supplier) => (
        <div className="catalog-row" key={supplier.id}>
          <div>
            <span>{supplier.name}</span>
            <small>{supplier.phone ?? "Sans telephone"}</small>
          </div>
          <div className="button-row">
            <span
              className={supplier.isActive ? "status-active" : "status-muted"}
            >
              {supplier.isActive ? "Actif" : "Inactif"}
            </span>
            {canUpdate ? (
              <button
                className="secondary-button"
                disabled={isSubmitting}
                onClick={() => onToggle(supplier)}
                type="button"
              >
                {supplier.isActive ? "Desactiver" : "Activer"}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}

function PurchaseList({
  purchases,
  canPost,
  canCancel,
  isSubmitting,
  onPost,
  onCancel,
}: {
  purchases: Purchase[];
  canPost: boolean;
  canCancel: boolean;
  isSubmitting: boolean;
  onPost: (purchase: Purchase) => void;
  onCancel: (purchase: Purchase) => void;
}) {
  if (purchases.length === 0) {
    return (
      <section className="panel">
        <p className="summary">Aucun achat trouve.</p>
      </section>
    );
  }

  return (
    <section className="panel item-list" aria-label="Achats">
      {purchases.map((purchase) => (
        <div className="catalog-row" key={purchase.id}>
          <div>
            <span>{purchase.supplier.name}</span>
            <small>
              {purchase.totalTnd} TND · {labelStatus(purchase.status)}
            </small>
            <small>
              {purchase.lines.length} ligne
              {purchase.lines.length > 1 ? "s" : ""}
            </small>
          </div>
          <div className="button-row">
            <strong>{purchase.paidAmountTnd} TND</strong>
            {purchase.status === "DRAFT" && canPost ? (
              <button
                disabled={isSubmitting}
                onClick={() => onPost(purchase)}
                type="button"
              >
                Confirmer
              </button>
            ) : null}
            {purchase.status === "POSTED" && canCancel ? (
              <button
                className="secondary-button"
                disabled={isSubmitting}
                onClick={() => onCancel(purchase)}
                type="button"
              >
                Annuler
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}

function SupplierBalanceList({
  balances,
  onStatement,
}: {
  balances: SupplierBalance[];
  onStatement: (supplierId: string) => void;
}) {
  if (balances.length === 0) {
    return (
      <section className="panel">
        <p className="summary">Aucun solde fournisseur trouve.</p>
      </section>
    );
  }

  return (
    <section className="panel item-list" aria-label="Soldes fournisseurs">
      <div className="panel-heading">
        <h3 id="balances-title">Soldes fournisseurs</h3>
        <span>{balances.length}</span>
      </div>
      {balances.map((balance) => (
        <div className="catalog-row" key={balance.supplier.id}>
          <div>
            <span>{balance.supplier.name}</span>
            <small>
              {balance.openPurchaseCount} achat ouvert ·{" "}
              {balance.overduePurchaseCount} en retard
            </small>
          </div>
          <div className="button-row">
            <strong>{balance.balanceTnd} TND</strong>
            <button
              className="secondary-button"
              onClick={() => onStatement(balance.supplier.id)}
              type="button"
            >
              Releve
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function SupplierStatementPanel({
  statement,
}: {
  statement: SupplierStatement | null;
}) {
  if (!statement) {
    return (
      <section className="panel">
        <p className="summary">
          Selectionnez un fournisseur pour voir le releve.
        </p>
      </section>
    );
  }

  return (
    <section className="panel item-list" aria-label="Releve fournisseur">
      <div className="panel-heading">
        <h3>{statement.supplier.name}</h3>
        <span>{statement.balanceTnd} TND</span>
      </div>
      {statement.purchases.length === 0 ? (
        <p className="summary">Aucun achat confirme.</p>
      ) : (
        statement.purchases.map((purchase) => (
          <div className="catalog-row" key={purchase.id}>
            <div>
              <span>{labelPaymentState(purchase.paymentState)}</span>
              <small>
                {purchase.totalTnd} TND ·{" "}
                {purchase.dueDate
                  ? new Date(purchase.dueDate).toLocaleDateString("fr-TN")
                  : "Sans echeance"}
              </small>
            </div>
            <strong>{purchase.balanceTnd} TND</strong>
          </div>
        ))
      )}
    </section>
  );
}

function SupplierPaymentList({ payments }: { payments: SupplierPayment[] }) {
  if (payments.length === 0) {
    return (
      <section className="panel">
        <p className="summary">Aucun paiement fournisseur trouve.</p>
      </section>
    );
  }

  return (
    <section className="panel item-list" aria-label="Paiements fournisseurs">
      <div className="panel-heading">
        <h3>Paiements</h3>
        <span>{payments.length}</span>
      </div>
      {payments.map((payment) => (
        <div className="catalog-row" key={payment.id}>
          <div>
            <span>{payment.supplier?.name ?? "Fournisseur"}</span>
            <small>
              {new Date(payment.paidAt).toLocaleDateString("fr-TN")} ·{" "}
              {payment.reference ?? "Sans reference"}
            </small>
          </div>
          <strong>{payment.amountTnd} TND</strong>
        </div>
      ))}
    </section>
  );
}

function labelStatus(status: Purchase["status"]): string {
  if (status === "DRAFT") {
    return "Brouillon";
  }
  if (status === "POSTED") {
    return "Confirme";
  }
  return "Annule";
}

function labelPaymentState(state: string): string {
  if (state === "PAID") {
    return "Paye";
  }
  if (state === "PARTIALLY_PAID") {
    return "Partiel";
  }
  if (state === "OVERDUE") {
    return "En retard";
  }
  if (state === "CANCELLED") {
    return "Annule";
  }
  return "Non paye";
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

function readMessage(error: unknown): string {
  const apiError = error as ApiError;
  return (
    apiError.error?.message ?? "Une erreur est survenue. Veuillez reessayer."
  );
}

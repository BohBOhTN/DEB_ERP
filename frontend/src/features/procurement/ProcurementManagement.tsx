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
  createSupplier,
  estimateLineTotal,
  estimatePurchaseTotal,
  getPurchases,
  getSuppliers,
  postPurchase,
  unitOptionsForLine,
  updateSupplier,
  type Purchase,
  type PurchaseDraftLineInput,
  type PurchasePaymentTerms,
  type Supplier,
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
      rawMaterials: RawMaterial[];
      units: Unit[];
    }
  | { status: "error"; message: string };

type ProcurementTab = "suppliers" | "purchases";

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
  const canLoadPurchaseInputs =
    permissions.has("raw_materials.view") && permissions.has("units.view");
  const visibleTabs = [
    ...(canViewPurchases
      ? [{ id: "purchases" as const, label: "Achats" }]
      : []),
    ...(canViewSuppliers
      ? [{ id: "suppliers" as const, label: "Fournisseurs" }]
      : []),
  ];

  useEffect(() => {
    if (!canViewSuppliers && !canViewPurchases) {
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
  }, [activeTab, canViewPurchases, canViewSuppliers, canLoadPurchaseInputs]);

  async function refreshProcurement(): Promise<LoadState> {
    const [suppliers, purchases, rawMaterials, units] = await Promise.all([
      canViewSuppliers
        ? getSuppliers()
        : Promise.resolve(emptyPage<Supplier>()),
      canViewPurchases
        ? getPurchases()
        : Promise.resolve(emptyPage<Purchase>()),
      canLoadPurchaseInputs
        ? getRawMaterials()
        : Promise.resolve(emptyPage<RawMaterial>()),
      canLoadPurchaseInputs ? getUnits() : Promise.resolve(emptyPage<Unit>()),
    ]);

    return {
      status: "loaded",
      suppliers: suppliers.items,
      purchases: purchases.items,
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

function labelStatus(status: Purchase["status"]): string {
  if (status === "DRAFT") {
    return "Brouillon";
  }
  if (status === "POSTED") {
    return "Confirme";
  }
  return "Annule";
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

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ApiError, CurrentUser } from "../auth/authApi";
import {
  getInventoryWorkspace,
  postAdjustment,
  postOpeningStock,
  type InventoryBalance,
  type InventoryItemType,
  type InventoryMovement,
} from "./inventoryApi";

interface InventoryManagementProps {
  user: CurrentUser;
}

type LoadState =
  | { status: "loading" }
  | {
      status: "loaded";
      balances: InventoryBalance[];
      movements: InventoryMovement[];
    }
  | { status: "error"; message: string };

export function InventoryManagement({ user }: InventoryManagementProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openingForm, setOpeningForm] = useState({
    itemType: "PRODUCT" as InventoryItemType,
    itemId: "",
    quantity: "",
    reason: "",
  });
  const [adjustmentForm, setAdjustmentForm] = useState({
    itemType: "PRODUCT" as InventoryItemType,
    itemId: "",
    quantityDelta: "",
    reason: "",
  });

  const permissions = useMemo(
    () => new Set(user.effectivePermissions),
    [user.effectivePermissions],
  );
  const canViewInventory = permissions.has("inventory.view");
  const canViewMovements = permissions.has("inventory.movements.view");
  const canPostOpening = permissions.has("inventory.opening_stock");
  const canAdjust = permissions.has("inventory.adjust");

  useEffect(() => {
    if (!canViewInventory && !canViewMovements) {
      setState({
        status: "error",
        message: "Vous n'avez pas acces au stock.",
      });
      return;
    }

    let isMounted = true;
    refreshInventory()
      .then((nextState) => {
        if (isMounted) {
          setState(nextState);
        }
      })
      .catch((error: ApiError) => {
        if (isMounted) {
          setState({
            status: "error",
            message: error.error?.message ?? "Impossible de charger le stock.",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [canViewInventory, canViewMovements]);

  async function refreshInventory(): Promise<LoadState> {
    if (canViewInventory && canViewMovements) {
      const workspace = await getInventoryWorkspace();
      return {
        status: "loaded",
        balances: workspace.balances,
        movements: workspace.movements.items,
      };
    }

    return {
      status: "loaded",
      balances: [],
      movements: [],
    };
  }

  async function reload() {
    setState(await refreshInventory());
  }

  async function handleOpeningStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(async () => {
      await postOpeningStock(openingForm);
      setOpeningForm({
        itemType: "PRODUCT",
        itemId: "",
        quantity: "",
        reason: "",
      });
      setNotice("Stock initial enregistre.");
    });
  }

  async function handleAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(async () => {
      await postAdjustment(adjustmentForm);
      setAdjustmentForm({
        itemType: "PRODUCT",
        itemId: "",
        quantityDelta: "",
        reason: "",
      });
      setNotice("Ajustement enregistre.");
    });
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

  if (state.status === "loading") {
    return <p aria-live="polite">Chargement du stock...</p>;
  }

  if (state.status === "error") {
    return <p role="alert">{state.message}</p>;
  }

  const negativeBalances = state.balances.filter(
    (balance) => balance.isNegative,
  );

  return (
    <section className="inventory-workspace" aria-labelledby="inventory-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Stock</p>
          <h2 id="inventory-title">Mouvements et soldes</h2>
        </div>
        <p className="permission-count">
          {negativeBalances.length} solde negatif
        </p>
      </div>

      {notice ? <p role="status">{notice}</p> : null}

      {negativeBalances.length > 0 ? (
        <p className="warning-banner">
          Des articles ont un solde negatif. Verifiez les mouvements avant de
          continuer.
        </p>
      ) : null}

      <div className="catalog-grid">
        {canPostOpening ? (
          <InventoryCommandForm
            buttonLabel="Enregistrer le stock initial"
            form={openingForm}
            quantityLabel="Quantite"
            onChange={(nextForm) =>
              setOpeningForm(nextForm as typeof openingForm)
            }
            onSubmit={handleOpeningStock}
            quantityKey="quantity"
            isSubmitting={isSubmitting}
          />
        ) : null}

        {canAdjust ? (
          <InventoryCommandForm
            buttonLabel="Enregistrer l'ajustement"
            form={adjustmentForm}
            quantityLabel="Variation"
            onChange={(nextForm) =>
              setAdjustmentForm(nextForm as typeof adjustmentForm)
            }
            onSubmit={handleAdjustment}
            quantityKey="quantityDelta"
            isSubmitting={isSubmitting}
          />
        ) : null}
      </div>

      <section className="catalog-grid">
        <div className="panel">
          <div className="panel-heading">
            <h3>Soldes</h3>
            <span>{state.balances.length}</span>
          </div>
          <div className="item-list">
            {state.balances.length === 0 ? (
              <p className="summary">Aucun solde stock trouve.</p>
            ) : (
              state.balances.map((balance) => (
                <div
                  className="catalog-row"
                  key={`${balance.itemType}-${balance.itemId}`}
                >
                  <div>
                    <span>{balance.itemName}</span>
                    <small>{balance.unitName}</small>
                  </div>
                  <strong className={balance.isNegative ? "status-danger" : ""}>
                    {balance.quantity}
                  </strong>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h3>Mouvements</h3>
            <span>{state.movements.length}</span>
          </div>
          <div className="item-list">
            {state.movements.length === 0 ? (
              <p className="summary">Aucun mouvement trouve.</p>
            ) : (
              state.movements.map((movement) => (
                <div className="catalog-row" key={movement.id}>
                  <div>
                    <span>{movement.itemNameSnapshot}</span>
                    <small>
                      {movement.movementType} · {movement.unitNameSnapshot}
                    </small>
                  </div>
                  <strong>{movement.quantityDelta}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </section>
  );
}

function InventoryCommandForm<TForm extends Record<string, string>>({
  buttonLabel,
  form,
  quantityLabel,
  quantityKey,
  isSubmitting,
  onChange,
  onSubmit,
}: {
  buttonLabel: string;
  form: TForm & { itemType: InventoryItemType; itemId: string; reason: string };
  quantityLabel: string;
  quantityKey: keyof TForm;
  isSubmitting: boolean;
  onChange: (form: TForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="panel inline-form" onSubmit={onSubmit}>
      <h3>{buttonLabel}</h3>
      <select
        aria-label="Type d'article"
        onChange={(event) =>
          onChange({
            ...form,
            itemType: event.target.value as InventoryItemType,
          })
        }
        value={form.itemType}
      >
        <option value="PRODUCT">Produit</option>
        <option value="RAW_MATERIAL">Matiere premiere</option>
      </select>
      <input
        aria-label="Identifiant article"
        onChange={(event) => onChange({ ...form, itemId: event.target.value })}
        placeholder="Identifiant article"
        required
        value={form.itemId}
      />
      <input
        aria-label={quantityLabel}
        inputMode="decimal"
        onChange={(event) =>
          onChange({ ...form, [quantityKey]: event.target.value })
        }
        placeholder={quantityLabel}
        required
        value={form[quantityKey]}
      />
      <input
        aria-label="Raison"
        onChange={(event) => onChange({ ...form, reason: event.target.value })}
        placeholder="Raison"
        required
        value={form.reason}
      />
      <button disabled={isSubmitting} type="submit">
        {buttonLabel}
      </button>
    </form>
  );
}

function readMessage(error: unknown): string {
  const apiError = error as ApiError;
  return (
    apiError.error?.message ?? "Une erreur est survenue. Veuillez reessayer."
  );
}

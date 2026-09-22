import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "../auth/authApi";
import {
  getRawMaterials,
  getUnits,
  type RawMaterial,
  type Unit,
} from "../catalog/catalogApi";
import {
  createSimulation,
  deleteSimulation,
  duplicateSimulation,
  getSimulation,
  getSimulations,
  type CostSimulation,
} from "./simulationApi";

interface SimulationManagementProps {
  user: CurrentUser;
}

interface IngredientDraft {
  rawMaterialId: string;
  ingredientName: string;
  enteredQuantity: string;
  enteredUnitId: string;
  unitPriceTnd: string;
  priceBasisUnitId: string;
  conversionFactorToBase: string;
}

function emptyIngredient(unitId: string): IngredientDraft {
  return {
    rawMaterialId: "",
    ingredientName: "",
    enteredQuantity: "",
    enteredUnitId: unitId,
    unitPriceTnd: "",
    priceBasisUnitId: unitId,
    conversionFactorToBase: "",
  };
}

export function SimulationManagement({ user }: SimulationManagementProps) {
  const permissions = useMemo(
    () => new Set(user.effectivePermissions),
    [user.effectivePermissions],
  );
  const canView = permissions.has("simulations.view");
  const canCreate = permissions.has("simulations.create");
  const canDelete = permissions.has("simulations.delete");

  const [simulations, setSimulations] = useState<CostSimulation[]>([]);
  const [selected, setSelected] = useState<CostSimulation | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [name, setName] = useState("");
  const [outputQuantity, setOutputQuantity] = useState("");
  const [outputUnitId, setOutputUnitId] = useState("");
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void refresh();
  }, [canView]);

  async function refresh() {
    setError("");
    setIsLoading(true);

    try {
      const [simulationPage, unitPage, rawMaterialPage] = await Promise.all([
        canView
          ? getSimulations()
          : Promise.resolve({
              items: [] as CostSimulation[],
              page: 1,
              pageSize: 25,
              total: 0,
              pageCount: 0,
            }),
        getUnits(),
        getRawMaterials(),
      ]);
      setSimulations(simulationPage.items);
      setUnits(unitPage.items);
      setRawMaterials(rawMaterialPage.items);

      if (!outputUnitId && unitPage.items[0]) {
        setOutputUnitId(unitPage.items[0].id);
      }
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

  /// The preview mirrors the documented formulas, but the server total is the
  /// authoritative one and is what gets stored.
  const previewTotal = ingredients.reduce((total, ingredient) => {
    const quantity = Number(ingredient.enteredQuantity || 0);
    const factor =
      ingredient.enteredUnitId === ingredient.priceBasisUnitId
        ? 1
        : Number(ingredient.conversionFactorToBase || 0);
    return total + quantity * factor * Number(ingredient.unitPriceTnd || 0);
  }, 0);
  const previewPerUnit =
    Number(outputQuantity) > 0 ? previewTotal / Number(outputQuantity) : 0;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (ingredients.length === 0) {
      setError("Ajoutez au moins un ingredient.");
      return;
    }

    await runCommand(async () => {
      const simulation = await createSimulation({
        name,
        outputQuantity,
        outputUnitId,
        ingredients: ingredients.map((ingredient) => ({
          ...(ingredient.rawMaterialId
            ? { rawMaterialId: ingredient.rawMaterialId }
            : {}),
          ...(ingredient.ingredientName
            ? { ingredientName: ingredient.ingredientName }
            : {}),
          enteredQuantity: ingredient.enteredQuantity,
          enteredUnitId: ingredient.enteredUnitId,
          unitPriceTnd: ingredient.unitPriceTnd,
          priceBasisUnitId: ingredient.priceBasisUnitId,
          ...(ingredient.conversionFactorToBase
            ? { conversionFactorToBase: ingredient.conversionFactorToBase }
            : {}),
        })),
      });
      setName("");
      setOutputQuantity("");
      setIngredients([]);
      setSelected(simulation);
      return `Simulation ${simulation.name} enregistree. Aucun effet sur le stock ni sur les soldes.`;
    });
  }

  async function handleSelect(simulationId: string) {
    setError("");

    try {
      setSelected(await getSimulation(simulationId));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (!canView && !canCreate) {
    return (
      <section className="simulation-workspace" aria-labelledby="sim-title">
        <h2 id="sim-title">Simulation de cout</h2>
        <p className="status-muted">
          Vous n'avez pas l'autorisation de consulter les simulations.
        </p>
      </section>
    );
  }

  return (
    <section className="simulation-workspace" aria-labelledby="sim-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Simulation</p>
          <h2 id="sim-title">Cout des ingredients</h2>
        </div>
        <span className="permission-count">{simulations.length}</span>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p className="status-active">{notice}</p> : null}
      {isLoading ? <p className="status-muted">Chargement...</p> : null}

      <div className="simulation-grid">
        {canCreate ? (
          <div className="panel">
            <div className="panel-heading">
              <h3>Nouvelle simulation</h3>
            </div>
            <form className="inline-form" onSubmit={handleCreate}>
              <label className="field">
                Nom du scenario
                <input
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label className="field">
                Quantite produite
                <input
                  min="0.001"
                  onChange={(event) => setOutputQuantity(event.target.value)}
                  required
                  step="0.001"
                  type="number"
                  value={outputQuantity}
                />
              </label>
              <label className="field">
                Unite de sortie
                <select
                  onChange={(event) => setOutputUnitId(event.target.value)}
                  required
                  value={outputUnitId}
                >
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>

              {ingredients.map((ingredient, index) => (
                <fieldset className="settlement-line" key={index}>
                  <legend>Ingredient {index + 1}</legend>
                  <label className="field">
                    Matiere premiere
                    <select
                      onChange={(event) =>
                        updateIngredient(index, {
                          rawMaterialId: event.target.value,
                        })
                      }
                      value={ingredient.rawMaterialId}
                    >
                      <option value="">Ingredient libre</option>
                      {rawMaterials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!ingredient.rawMaterialId ? (
                    <label className="field">
                      Nom de l'ingredient
                      <input
                        onChange={(event) =>
                          updateIngredient(index, {
                            ingredientName: event.target.value,
                          })
                        }
                        required
                        value={ingredient.ingredientName}
                      />
                    </label>
                  ) : null}
                  <label className="field">
                    Quantite
                    <input
                      min="0.000001"
                      onChange={(event) =>
                        updateIngredient(index, {
                          enteredQuantity: event.target.value,
                        })
                      }
                      required
                      step="0.000001"
                      type="number"
                      value={ingredient.enteredQuantity}
                    />
                  </label>
                  <label className="field">
                    Unite saisie
                    <select
                      onChange={(event) =>
                        updateIngredient(index, {
                          enteredUnitId: event.target.value,
                        })
                      }
                      value={ingredient.enteredUnitId}
                    >
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Prix unitaire (TND)
                    <input
                      min="0"
                      onChange={(event) =>
                        updateIngredient(index, {
                          unitPriceTnd: event.target.value,
                        })
                      }
                      required
                      step="0.001"
                      type="number"
                      value={ingredient.unitPriceTnd}
                    />
                  </label>
                  <label className="field">
                    Unite du prix
                    <select
                      onChange={(event) =>
                        updateIngredient(index, {
                          priceBasisUnitId: event.target.value,
                        })
                      }
                      value={ingredient.priceBasisUnitId}
                    >
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {ingredient.enteredUnitId !== ingredient.priceBasisUnitId ? (
                    <label className="field">
                      Facteur de conversion
                      <input
                        min="0.000001"
                        onChange={(event) =>
                          updateIngredient(index, {
                            conversionFactorToBase: event.target.value,
                          })
                        }
                        step="0.000001"
                        type="number"
                        value={ingredient.conversionFactorToBase}
                      />
                      <small className="record-meta">
                        Laissez vide pour utiliser la conversion declaree sur la
                        matiere premiere.
                      </small>
                    </label>
                  ) : null}
                  <button
                    className="secondary-button"
                    onClick={() =>
                      setIngredients(
                        ingredients.filter((_, position) => position !== index),
                      )
                    }
                    type="button"
                  >
                    Retirer
                  </button>
                </fieldset>
              ))}

              <button
                className="secondary-button"
                onClick={() =>
                  setIngredients([
                    ...ingredients,
                    emptyIngredient(outputUnitId || units[0]?.id || ""),
                  ])
                }
                type="button"
              >
                Ajouter un ingredient
              </button>

              <div className="metric-row">
                <span>Cout total estime</span>
                <strong>{formatTnd(String(previewTotal))}</strong>
              </div>
              <div className="metric-row">
                <span>Cout par produit estime</span>
                <strong>{formatTnd(String(previewPerUnit))}</strong>
              </div>
              <p className="status-muted">
                Estimation uniquement. Le serveur recalcule les totaux. Une
                simulation ne modifie ni le stock, ni les soldes, ni les
                recettes, ni les depenses.
              </p>

              <button
                className="primary-button"
                disabled={isSubmitting}
                type="submit"
              >
                Enregistrer la simulation
              </button>
            </form>
          </div>
        ) : null}

        <div className="panel">
          <div className="panel-heading">
            <h3>Scenarios</h3>
            <span>{simulations.length}</span>
          </div>
          {simulations.length === 0 ? (
            <p className="status-muted">Aucune simulation.</p>
          ) : (
            <ul className="record-list">
              {simulations.map((simulation) => (
                <li key={simulation.id}>
                  <button
                    aria-pressed={selected?.id === simulation.id}
                    className="record-button"
                    onClick={() => void handleSelect(simulation.id)}
                    type="button"
                  >
                    <span className="record-title">{simulation.name}</span>
                    <span className="record-meta">
                      {formatTnd(simulation.costPerOutputUnitTnd)} par{" "}
                      {simulation.outputUnitNameSnapshot}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h3>Detail</h3>
          </div>
          {!selected ? (
            <p className="status-muted">Selectionnez une simulation.</p>
          ) : (
            <div className="assignment-panel">
              <div className="metric-row">
                <span>Cout total des ingredients</span>
                <strong>{formatTnd(selected.totalIngredientCostTnd)}</strong>
              </div>
              <div className="metric-row">
                <span>
                  Cout par {selected.outputUnitNameSnapshot} ({" "}
                  {selected.outputQuantity} )
                </span>
                <strong>{formatTnd(selected.costPerOutputUnitTnd)}</strong>
              </div>

              {selected.ingredients.map((ingredient) => (
                <div className="metric-row" key={ingredient.id}>
                  <span>
                    {ingredient.ingredientName}
                    <small>
                      {ingredient.enteredQuantity}{" "}
                      {ingredient.enteredUnitNameSnapshot} ·{" "}
                      {formatTnd(ingredient.unitPriceTnd)} /{" "}
                      {ingredient.priceBasisUnitNameSnapshot}
                    </small>
                  </span>
                  <strong>{formatTnd(ingredient.lineCostTnd)}</strong>
                </div>
              ))}

              {canCreate ? (
                <button
                  className="secondary-button"
                  disabled={isSubmitting}
                  onClick={() =>
                    void runCommand(async () => {
                      const copy = await duplicateSimulation(selected.id);
                      setSelected(copy);
                      return "Simulation dupliquee.";
                    })
                  }
                  type="button"
                >
                  Dupliquer
                </button>
              ) : null}

              {canDelete ? (
                <button
                  className="secondary-button"
                  disabled={isSubmitting}
                  onClick={() =>
                    void runCommand(async () => {
                      await deleteSimulation(selected.id);
                      setSelected(null);
                      return "Simulation supprimee.";
                    })
                  }
                  type="button"
                >
                  Supprimer
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );

  function updateIngredient(index: number, patch: Partial<IngredientDraft>) {
    setIngredients((current) =>
      current.map((ingredient, position) =>
        position === index ? { ...ingredient, ...patch } : ingredient,
      ),
    );
  }
}

function formatTnd(value: string): string {
  return new Intl.NumberFormat("fr-TN", {
    style: "currency",
    currency: "TND",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value) || 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operation impossible.";
}

import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/Button/Button.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { MoneyInput } from "../../../components/ui/MoneyInput/MoneyInput.js";
import { QuantityInput } from "../../../components/ui/QuantityInput/QuantityInput.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl/SegmentedControl.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { createIdempotencyKey } from "../../../lib/api/idempotency.js";
import { formatMoney, formatQuantity } from "../../../i18n/format.js";
import type { RawMaterial, Unit } from "../../catalog/catalog.api.js";
import {
  ItemCombobox,
  type ItemSource,
} from "../../inventory/components/ItemCombobox.js";
import { listPurchases } from "../../procurement/procurement.api.js";
import {
  ingredientLineCost,
  safeDecimal,
  type IngredientLineValues,
} from "../simulation.schemas.js";
import styles from "./SimulationForms.module.css";

export interface IngredientLineEditorProps {
  lines: IngredientLineValues[];
  onChange: (lines: IngredientLineValues[]) => void;
  units: Unit[];
  /// Keys `ingredients.<index>.<field>` and `ingredients`.
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
}

export function newIngredientLine(): IngredientLineValues {
  return {
    key: createIdempotencyKey(),
    mode: "RAW",
    rawMaterial: null,
    ingredientName: "",
    enteredQuantity: "",
    enteredUnitId: "",
    unitPriceTnd: "",
    priceBasisUnitId: "",
    factorToBase: "1",
  };
}

function factorFor(rawMaterial: RawMaterial, unitId: string): string {
  if (unitId === rawMaterial.baseUnitId) return "1";
  return (
    rawMaterial.conversions.find(
      (conversion) => conversion.unitId === unitId && conversion.isActive,
    )?.factorToBase ?? "1"
  );
}

/// The last posted purchase price of a raw material, per base unit, as the
/// default the spec asks for; missing permission or history leaves the
/// price to be typed.
async function lastPurchasePrice(
  rawMaterialId: string,
): Promise<string | null> {
  try {
    const page = await listPurchases({
      page: 1,
      pageSize: 1,
      rawMaterialId,
      status: "POSTED",
      sort: { field: "purchaseDate", direction: "desc" },
    });
    return (
      page.items[0]?.lines.find((line) => line.rawMaterialId === rawMaterialId)
        ?.unitPriceTnd ?? null
    );
  } catch {
    return null;
  }
}

/// Ingredient lines (07 section 4.9, SIM-004): a catalogue raw material
/// with its units and a price per base unit, or a free-text ingredient
/// priced in the unit it is entered in; the line cost is shown live.
export function IngredientLineEditor({
  lines,
  onChange,
  units,
  errors = {},
  disabled = false,
}: IngredientLineEditorProps) {
  const update = (key: string, patch: Partial<IngredientLineValues>) =>
    onChange(
      lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  const errorFor = (index: number, field: string) =>
    errors[`ingredients.${index}.${field}`];

  const pickRawMaterial = (
    line: IngredientLineValues,
    source: ItemSource | null,
  ) => {
    if (!source || source.kind !== "RAW_MATERIAL") {
      update(line.key, {
        rawMaterial: null,
        ingredientName: "",
        enteredUnitId: "",
        priceBasisUnitId: "",
        factorToBase: "1",
      });
      return;
    }
    const rawMaterial = source.rawMaterial;
    update(line.key, {
      rawMaterial,
      ingredientName: rawMaterial.name,
      enteredUnitId: rawMaterial.baseUnitId,
      priceBasisUnitId: rawMaterial.baseUnitId,
      factorToBase: "1",
    });
    void lastPurchasePrice(rawMaterial.id).then((price) => {
      if (price) {
        onChange(
          lines.map((candidate) =>
            candidate.key === line.key
              ? {
                  ...candidate,
                  rawMaterial,
                  ingredientName: rawMaterial.name,
                  enteredUnitId: rawMaterial.baseUnitId,
                  priceBasisUnitId: rawMaterial.baseUnitId,
                  factorToBase: "1",
                  unitPriceTnd: candidate.unitPriceTnd || price,
                }
              : candidate,
          ),
        );
      }
    });
  };

  return (
    <div className={styles.stack}>
      {lines.map((line, index) => {
        const unitOptions =
          line.mode === "RAW" && line.rawMaterial
            ? [
                {
                  value: line.rawMaterial.baseUnitId,
                  label: line.rawMaterial.baseUnit.name,
                },
                ...line.rawMaterial.conversions
                  .filter((conversion) => conversion.isActive)
                  .map((conversion) => ({
                    value: conversion.unitId,
                    label: conversion.unit.name,
                  })),
              ]
            : units.map((unit) => ({ value: unit.id, label: unit.name }));
        const priceUnit =
          units.find((unit) => unit.id === line.priceBasisUnitId)?.symbol ??
          line.rawMaterial?.baseUnit.symbol ??
          "";
        const enteredUnit = unitOptions.find(
          (option) => option.value === line.enteredUnitId,
        )?.label;
        return (
          <div
            key={line.key}
            className={styles.line}
            role="group"
            aria-label={`Ingrédient ${index + 1}`}
          >
            <div className={styles.lineHead}>
              <SegmentedControl<"RAW" | "FREE">
                label={`Type de l'ingrédient ${index + 1}`}
                size="sm"
                value={line.mode}
                onValueChange={(mode) =>
                  update(line.key, {
                    mode,
                    rawMaterial: null,
                    ingredientName: "",
                    enteredUnitId: mode === "FREE" ? (units[0]?.id ?? "") : "",
                    priceBasisUnitId:
                      mode === "FREE" ? (units[0]?.id ?? "") : "",
                    factorToBase: "1",
                  })
                }
                options={[
                  { value: "RAW", label: "Matière première" },
                  { value: "FREE", label: "Ingrédient libre" },
                ]}
              />
              <IconButton
                label={`Retirer l'ingrédient ${index + 1}`}
                icon={<Trash2 />}
                size="sm"
                variant="danger"
                disabled={disabled}
                onClick={() =>
                  onChange(
                    lines.filter((candidate) => candidate.key !== line.key),
                  )
                }
              />
            </div>
            <div className={styles.fields}>
              {line.mode === "RAW" ? (
                <FormField
                  label="Matière première"
                  error={errorFor(index, "ingredientName")}
                  required
                >
                  <ItemCombobox
                    aria-label={`Matière première ${index + 1}`}
                    itemTypes={["RAW_MATERIAL"]}
                    value={
                      line.rawMaterial
                        ? {
                            itemType: "RAW_MATERIAL",
                            itemId: line.rawMaterial.id,
                            label: line.rawMaterial.name,
                            unitSymbol: line.rawMaterial.baseUnit.symbol,
                            currentQuantity: "0",
                          }
                        : null
                    }
                    onChange={(_item, source) => pickRawMaterial(line, source)}
                    invalid={Boolean(errorFor(index, "ingredientName"))}
                    disabled={disabled}
                  />
                </FormField>
              ) : (
                <FormField
                  label="Ingrédient"
                  error={errorFor(index, "ingredientName")}
                  required
                >
                  <TextInput
                    aria-label={`Ingrédient ${index + 1}`}
                    value={line.ingredientName}
                    onChange={(event) =>
                      update(line.key, { ingredientName: event.target.value })
                    }
                    invalid={Boolean(errorFor(index, "ingredientName"))}
                    disabled={disabled}
                  />
                </FormField>
              )}
              <FormField
                label="Quantité"
                error={errorFor(index, "enteredQuantity")}
                required
              >
                <QuantityInput
                  aria-label={`Quantité ${index + 1}`}
                  value={line.enteredQuantity}
                  onChange={(enteredQuantity) =>
                    update(line.key, { enteredQuantity })
                  }
                  invalid={Boolean(errorFor(index, "enteredQuantity"))}
                  disabled={disabled}
                />
              </FormField>
              <FormField
                label="Unité"
                error={errorFor(index, "enteredUnitId")}
                required
              >
                <Select
                  aria-label={`Unité ${index + 1}`}
                  placeholder="Unité"
                  value={line.enteredUnitId || null}
                  onValueChange={(unitId) =>
                    update(line.key, {
                      enteredUnitId: unitId ?? "",
                      ...(line.mode === "RAW" && line.rawMaterial
                        ? {
                            factorToBase: factorFor(
                              line.rawMaterial,
                              unitId ?? "",
                            ),
                          }
                        : {
                            priceBasisUnitId: unitId ?? "",
                            factorToBase: "1",
                          }),
                    })
                  }
                  options={unitOptions}
                  invalid={Boolean(errorFor(index, "enteredUnitId"))}
                  disabled={
                    disabled || (line.mode === "RAW" && !line.rawMaterial)
                  }
                />
              </FormField>
              <FormField
                label={`Prix unitaire${priceUnit ? ` (par ${priceUnit})` : ""}`}
                error={errorFor(index, "unitPriceTnd")}
                required
                hint={
                  line.mode === "RAW"
                    ? "Proposé depuis le dernier achat, modifiable."
                    : undefined
                }
              >
                <MoneyInput
                  aria-label={`Prix unitaire ${index + 1}`}
                  value={line.unitPriceTnd}
                  onChange={(unitPriceTnd) =>
                    update(line.key, { unitPriceTnd })
                  }
                  invalid={Boolean(errorFor(index, "unitPriceTnd"))}
                  disabled={disabled}
                />
              </FormField>
            </div>
            <div className={styles.lineFooter}>
              <span className={styles.muted}>
                {safeDecimal(line.factorToBase || 1).equals(1)
                  ? enteredUnit
                    ? `Prix et quantité en ${enteredUnit.toLowerCase()}.`
                    : ""
                  : `= ${formatQuantity(safeDecimal(line.enteredQuantity).times(safeDecimal(line.factorToBase)).toString(), priceUnit)} au prix par ${priceUnit}.`}
              </span>
              <span className={`${styles.lineCost} tabular-nums`}>
                Coût {formatMoney(ingredientLineCost(line).toFixed(3))}
              </span>
            </div>
          </div>
        );
      })}
      {errors.ingredients ? (
        <p className={styles.error}>{errors.ingredients}</p>
      ) : null}
      <div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus />}
          disabled={disabled}
          onClick={() => onChange([...lines, newIngredientLine()])}
        >
          Ajouter un ingrédient
        </Button>
      </div>
    </div>
  );
}

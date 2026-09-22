import Decimal from "decimal.js-light";
import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { formatMoney } from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import { Button } from "../../ui/Button/Button.js";
import { Combobox, type ComboboxOption } from "../../ui/Combobox/Combobox.js";
import { IconButton } from "../../ui/IconButton/IconButton.js";
import { MoneyInput } from "../../ui/MoneyInput/MoneyInput.js";
import { QuantityInput } from "../../ui/QuantityInput/QuantityInput.js";
import { Select, type SelectOption } from "../../ui/Select/Select.js";
import styles from "./LineEditor.module.css";

export interface EditorLine {
  key: string;
  item: ComboboxOption | null;
  quantity: string;
  unitId?: string | null;
  unitPriceTnd: string;
}

export interface LineEditorProps {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  loadItems: (query: string) => Promise<ComboboxOption[]>;
  /// Units offered for a line; omitted when the item's unit is fixed.
  unitsFor?: (line: EditorLine) => SelectOption[];
  itemLabel?: string;
  addLabel?: string;
  /// Unit price editable (purchases, simulation) or fixed from the catalogue (POS).
  priceEditable?: boolean;
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
  /// Extra content under the lines (a subtotal, a hint).
  footer?: ReactNode;
  className?: string;
}

export function lineTotal(
  line: Pick<EditorLine, "quantity" | "unitPriceTnd">,
): string {
  try {
    return new Decimal(line.quantity || 0)
      .times(line.unitPriceTnd || 0)
      .toFixed(3);
  } catch {
    return "0.000";
  }
}

export function linesTotal(
  lines: Array<Pick<EditorLine, "quantity" | "unitPriceTnd">>,
): string {
  return lines
    .reduce((sum, line) => sum.plus(lineTotal(line)), new Decimal(0))
    .toFixed(3);
}

let keySequence = 0;

export function newLine(): EditorLine {
  keySequence += 1;

  return {
    key: `line-${keySequence}`,
    item: null,
    quantity: "",
    unitId: null,
    unitPriceTnd: "",
  };
}

/// Product/quantity/unit/price lines shared by purchases, POS, orders,
/// dispatch and simulation (05 section 3.2). Each line is a card on phones.
export function LineEditor({
  lines,
  onChange,
  loadItems,
  unitsFor,
  itemLabel = fr.product,
  addLabel = "Ajouter une ligne",
  priceEditable = true,
  errors = {},
  disabled = false,
  footer,
  className,
}: LineEditorProps) {
  const update = (key: string, patch: Partial<EditorLine>) =>
    onChange(
      lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  const remove = (key: string) =>
    onChange(lines.filter((line) => line.key !== key));

  return (
    <div className={cx(styles.root, className)}>
      <div
        className={cx(styles.header, unitsFor && styles.withUnit)}
        aria-hidden="true"
      >
        <span>{itemLabel}</span>
        <span>{fr.quantity}</span>
        {unitsFor ? <span>{fr.unit}</span> : null}
        <span className={styles.right}>{fr.unitPrice}</span>
        <span className={styles.right}>{fr.lineTotal}</span>
        <span />
      </div>
      <ul className={styles.lines}>
        {lines.map((line, index) => {
          const units = unitsFor?.(line);
          const errorFor = (field: string) => errors[`lines.${index}.${field}`];

          return (
            <li
              key={line.key}
              className={cx(styles.line, unitsFor && styles.withUnit)}
            >
              <div className={styles.cell}>
                <Combobox
                  aria-label={`${itemLabel} ${index + 1}`}
                  loadOptions={loadItems}
                  value={line.item}
                  onChange={(item) => update(line.key, { item })}
                  placeholder={`Rechercher ${itemLabel.toLowerCase()}`}
                  disabled={disabled}
                  invalid={Boolean(
                    errorFor("productId") ?? errorFor("rawMaterialId"),
                  )}
                />
                {(errorFor("productId") ?? errorFor("rawMaterialId")) ? (
                  <p className={styles.error}>
                    {errorFor("productId") ?? errorFor("rawMaterialId")}
                  </p>
                ) : null}
              </div>
              <div className={styles.cell}>
                <QuantityInput
                  aria-label={`${fr.quantity} ${index + 1}`}
                  value={line.quantity}
                  onChange={(quantity) => update(line.key, { quantity })}
                  disabled={disabled}
                  invalid={Boolean(errorFor("quantity"))}
                />
                {errorFor("quantity") ? (
                  <p className={styles.error}>{errorFor("quantity")}</p>
                ) : null}
              </div>
              {units ? (
                <div className={styles.cell}>
                  <Select
                    aria-label={`${fr.unit} ${index + 1}`}
                    options={units}
                    value={line.unitId ?? null}
                    onValueChange={(unitId) => update(line.key, { unitId })}
                    disabled={disabled}
                  />
                </div>
              ) : null}
              <div className={styles.cell}>
                {priceEditable ? (
                  <MoneyInput
                    aria-label={`${fr.unitPrice} ${index + 1}`}
                    value={line.unitPriceTnd}
                    onChange={(unitPriceTnd) =>
                      update(line.key, { unitPriceTnd })
                    }
                    disabled={disabled}
                    invalid={Boolean(errorFor("unitPriceTnd"))}
                  />
                ) : (
                  <span className={cx(styles.readonly, "tabular-nums")}>
                    {formatMoney(line.unitPriceTnd || 0)}
                  </span>
                )}
              </div>
              <div className={cx(styles.cell, styles.total)}>
                <span className={styles.mobileLabel}>{fr.lineTotal}</span>
                <span className="tabular-nums">
                  {formatMoney(lineTotal(line))}
                </span>
              </div>
              <div className={cx(styles.cell, styles.remove)}>
                <IconButton
                  label={`${fr.remove} la ligne ${index + 1}`}
                  icon={<Trash2 />}
                  size="sm"
                  variant="danger"
                  disabled={disabled}
                  onClick={() => remove(line.key)}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {errors.lines ? <p className={styles.error}>{errors.lines}</p> : null}
      <div className={styles.footer}>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus />}
          disabled={disabled}
          onClick={() => onChange([...lines, newLine()])}
        >
          {addLabel}
        </Button>
        {footer}
      </div>
    </div>
  );
}

import Decimal from "decimal.js-light";
import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
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
  /// Hide the price and total columns for quantity-only documents (dispatch).
  showPrice?: boolean;
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
  /// Helper text under a line (a normalised quantity such as "= 50,000 kg").
  lineHint?: (line: EditorLine) => ReactNode;
  /// Overrides the quantity × price total, for documents whose price is per
  /// base unit while the quantity is entered in another unit (purchases).
  lineTotalFor?: (line: EditorLine) => string;
  /// The unit price a typed line total means, when the default total ÷
  /// quantity does not hold (purchases divide by the base quantity). `null`
  /// leaves the price untouched (no quantity yet). Issue 009.
  unitPriceFromTotal?: (line: EditorLine, totalTnd: string) => string | null;
  /// Extra content under the lines (a subtotal, a hint).
  footer?: ReactNode;
  className?: string;
}

/// Unit price for a typed total: total ÷ quantity, three decimals, or
/// `null` without a positive quantity. The stored total is then quantity ×
/// that price, which can differ from the typed total by a few millimes.
export function unitPriceForTotal(
  quantity: string,
  totalTnd: string,
): string | null {
  try {
    const count = new Decimal(quantity.replace(",", ".") || 0);
    const total = new Decimal(totalTnd.replace(",", ".") || 0);
    if (!count.greaterThan(0) || totalTnd.trim() === "") {
      return null;
    }
    return total.dividedBy(count).toDecimalPlaces(3).toFixed(3);
  } catch {
    return null;
  }
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
  showPrice = true,
  errors = {},
  disabled = false,
  lineHint,
  lineTotalFor,
  unitPriceFromTotal,
  footer,
  className,
}: LineEditorProps) {
  // What the user is typing in a total field, shown until the field is
  // left; the stored total (quantity × the derived price) shows afterwards.
  const [totalDrafts, setTotalDrafts] = useState<Record<string, string>>({});
  const update = (key: string, patch: Partial<EditorLine>) =>
    onChange(
      lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  const clearDraft = (key: string) =>
    setTotalDrafts((drafts) => {
      if (!(key in drafts)) return drafts;
      const rest = { ...drafts };
      delete rest[key];
      return rest;
    });
  const updateFromTotal = (line: EditorLine, totalTnd: string) => {
    setTotalDrafts((drafts) => ({ ...drafts, [line.key]: totalTnd }));
    const unitPriceTnd = unitPriceFromTotal
      ? unitPriceFromTotal(line, totalTnd)
      : unitPriceForTotal(line.quantity, totalTnd);
    if (unitPriceTnd !== null) {
      update(line.key, { unitPriceTnd });
    }
  };
  const remove = (key: string) =>
    onChange(lines.filter((line) => line.key !== key));

  return (
    <div className={cx(styles.root, className)}>
      <div
        className={cx(
          styles.header,
          unitsFor && styles.withUnit,
          !showPrice && styles.noPrice,
        )}
        aria-hidden="true"
      >
        <span>{itemLabel}</span>
        <span>{fr.quantity}</span>
        {unitsFor ? <span>{fr.unit}</span> : null}
        {showPrice ? (
          <>
            <span className={styles.right}>{fr.unitPrice}</span>
            <span className={styles.right}>{fr.lineTotal}</span>
          </>
        ) : null}
        <span />
      </div>
      <ul className={styles.lines}>
        {lines.map((line, index) => {
          const units = unitsFor?.(line);
          const errorFor = (field: string) => errors[`lines.${index}.${field}`];

          return (
            <li
              key={line.key}
              className={cx(
                styles.line,
                unitsFor && styles.withUnit,
                !showPrice && styles.noPrice,
              )}
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
                  onChange={(quantity) => {
                    clearDraft(line.key);
                    update(line.key, { quantity });
                  }}
                  disabled={disabled}
                  invalid={Boolean(errorFor("quantity"))}
                />
                {errorFor("quantity") ? (
                  <p className={styles.error}>{errorFor("quantity")}</p>
                ) : null}
                {lineHint ? (
                  <p className={styles.hint}>{lineHint(line)}</p>
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
              {showPrice ? (
                <div className={styles.cell}>
                  {priceEditable ? (
                    <MoneyInput
                      aria-label={`${fr.unitPrice} ${index + 1}`}
                      value={line.unitPriceTnd}
                      onChange={(unitPriceTnd) => {
                        clearDraft(line.key);
                        update(line.key, { unitPriceTnd });
                      }}
                      disabled={disabled}
                      invalid={Boolean(errorFor("unitPriceTnd"))}
                    />
                  ) : (
                    <span className={cx(styles.readonly, "tabular-nums")}>
                      {formatMoney(line.unitPriceTnd || 0)}
                    </span>
                  )}
                  {errorFor("unitPriceTnd") ? (
                    <p className={styles.error}>{errorFor("unitPriceTnd")}</p>
                  ) : null}
                </div>
              ) : null}
              {showPrice ? (
                <div className={cx(styles.cell, styles.total)}>
                  <span className={styles.mobileLabel}>{fr.lineTotal}</span>
                  {priceEditable ? (
                    <MoneyInput
                      aria-label={`${fr.lineTotal} ${index + 1}`}
                      value={
                        totalDrafts[line.key] ??
                        (lineTotalFor ? lineTotalFor(line) : lineTotal(line))
                      }
                      onChange={(totalTnd) => updateFromTotal(line, totalTnd)}
                      onBlur={() => clearDraft(line.key)}
                      disabled={disabled}
                    />
                  ) : (
                    <span className="tabular-nums">
                      {formatMoney(
                        lineTotalFor ? lineTotalFor(line) : lineTotal(line),
                      )}
                    </span>
                  )}
                </div>
              ) : null}
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

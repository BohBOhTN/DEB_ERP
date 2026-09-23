import { FormField } from "../../../components/ui/FormField/FormField.js";
import { MoneyInput } from "../../../components/ui/MoneyInput/MoneyInput.js";
import { QuantityInput } from "../../../components/ui/QuantityInput/QuantityInput.js";
import { cx } from "../../../lib/cx.js";
import { formatMoney, formatQuantity } from "../../../i18n/format.js";
import {
  settlementLineTotal,
  settlementRemainder,
  type SettlementLineValues,
} from "../distribution.schemas.js";
import styles from "./DistributionForms.module.css";

export interface SettlementLineEditorProps {
  lines: SettlementLineValues[];
  onChange: (lines: SettlementLineValues[]) => void;
  /// Keys `lines.<index>.remainder` and `lines.<index>.unitPriceTnd`.
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
}

const fields: Array<{
  key: keyof Pick<
    SettlementLineValues,
    | "soldQuantity"
    | "returnedQuantity"
    | "stillHeldQuantity"
    | "unaccountedQuantity"
  >;
  label: string;
}> = [
  { key: "soldQuantity", label: "Vendue" },
  { key: "returnedQuantity", label: "Retournée" },
  { key: "stillHeldQuantity", label: "Encore en dépôt" },
  { key: "unaccountedQuantity", label: "Non justifiée" },
];

/// Settlement lines (section 14.4): four quantities per line that must add
/// up to what is still held, with the remainder shown live and the row in
/// error until the equation holds; the price applies to the sold quantity.
export function SettlementLineEditor({
  lines,
  onChange,
  errors = {},
  disabled = false,
}: SettlementLineEditorProps) {
  const update = (index: number, patch: Partial<SettlementLineValues>) =>
    onChange(
      lines.map((line, candidate) =>
        candidate === index ? { ...line, ...patch } : line,
      ),
    );

  return (
    <div className={styles.stack}>
      {lines.map((line, index) => {
        const remainder = settlementRemainder(line);
        const balanced = remainder.isZero();
        const remainderError = errors[`lines.${index}.remainder`];
        const priceError = errors[`lines.${index}.unitPriceTnd`];
        return (
          <div
            key={line.dispatchLineId}
            className={cx(
              styles.settlementLine,
              (remainderError || !balanced) && styles.invalid,
            )}
            role="group"
            aria-label={line.productName}
          >
            <div className={styles.settlementHead}>
              <strong>{line.productName}</strong>
              <span className={styles.muted}>
                En dépôt : {formatQuantity(line.heldQuantity, line.unitName)}
              </span>
            </div>
            <div className={styles.quantities}>
              {fields.map((field) => (
                <FormField key={field.key} label={field.label}>
                  <QuantityInput
                    aria-label={`${field.label} ${line.productName}`}
                    value={line[field.key]}
                    onChange={(value) => update(index, { [field.key]: value })}
                    unit={line.unitName}
                    disabled={disabled}
                    invalid={!balanced}
                  />
                </FormField>
              ))}
            </div>
            <div className={styles.equation} aria-live="polite">
              <span>
                Vendue + retournée + encore en dépôt + non justifiée ={" "}
                {formatQuantity(line.heldQuantity, line.unitName)}
              </span>
              <strong className={balanced ? "ok" : "ko"}>
                {balanced
                  ? "Équation vérifiée"
                  : remainder.greaterThan(0)
                    ? `Reste ${remainder.toString()} à classer`
                    : `Dépassement de ${remainder.abs().toString()}`}
              </strong>
            </div>
            {remainderError ? (
              <p className={styles.error}>{remainderError}</p>
            ) : null}
            <div className={styles.priceRow}>
              <FormField
                label="Prix unitaire vendu"
                error={priceError}
                hint="Proposé depuis le prix du produit, modifiable."
              >
                <MoneyInput
                  aria-label={`Prix unitaire ${line.productName}`}
                  value={line.unitPriceTnd}
                  onChange={(unitPriceTnd) => update(index, { unitPriceTnd })}
                  disabled={disabled}
                  invalid={Boolean(priceError)}
                />
              </FormField>
              <span className={cx(styles.lineTotal, "tabular-nums")}>
                Revenu {formatMoney(settlementLineTotal(line).toFixed(3))}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

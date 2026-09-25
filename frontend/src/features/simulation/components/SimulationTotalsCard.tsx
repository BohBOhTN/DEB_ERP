import Decimal from "decimal.js-light";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { TotalsCard } from "../../../components/patterns/TotalsCard/TotalsCard.js";
import { formatMoney } from "../../../i18n/format.js";
import styles from "./SimulationForms.module.css";

export interface SimulationTotalsCardProps {
  totalTnd: string;
  perUnitTnd: string;
  outputUnitName: string;
  /// The target product's sale price, when a product is chosen.
  salePriceTnd?: string | null;
  provisional?: boolean;
}

/// Ingredient cost, unit cost and an informational margin (07 section 4.9,
/// SIM-010): the margin never enters the cost and is labelled as indicative.
export function SimulationTotalsCard({
  totalTnd,
  perUnitTnd,
  outputUnitName,
  salePriceTnd = null,
  provisional = false,
}: SimulationTotalsCardProps) {
  const margin = salePriceTnd
    ? new Decimal(salePriceTnd).minus(perUnitTnd)
    : null;
  const marginRate =
    margin && salePriceTnd && Number(salePriceTnd) > 0
      ? margin.dividedBy(salePriceTnd).times(100).toDecimalPlaces(1)
      : null;

  return (
    <div className={styles.stack}>
      <TotalsCard totalTnd={totalTnd} provisional={provisional} />
      <KeyValueList
        items={[
          {
            label: "Coût des ingrédients",
            value: formatMoney(totalTnd),
            numeric: true,
          },
          {
            label: `Coût unitaire (par ${outputUnitName.toLowerCase()})`,
            value: <strong>{formatMoney(perUnitTnd)}</strong>,
            numeric: true,
          },
        ]}
      />
      {salePriceTnd && margin ? (
        <div className={styles.margin} aria-label="Marge indicative">
          <span className={styles.muted}>
            Marge indicative sur le prix de vente {formatMoney(salePriceTnd)}
          </span>
          <strong className="tabular-nums">
            {formatMoney(margin.toFixed(3))}
            {marginRate ? ` (${marginRate.toString()} %)` : ""}
          </strong>
          <span className={styles.muted}>
            Information seulement : frais généraux, emballage et main-d'œuvre ne
            sont pas comptés.
          </span>
        </div>
      ) : null}
    </div>
  );
}

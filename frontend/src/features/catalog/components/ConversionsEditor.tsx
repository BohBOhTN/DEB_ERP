import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/Button/Button.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { NumberInput } from "../../../components/ui/NumberInput/NumberInput.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { fr } from "../../../i18n/fr.js";
import type { Unit } from "../catalog.api.js";
import styles from "./ConversionsEditor.module.css";

export interface ConversionRow {
  unitId: string;
  factorToBase: string;
}

export interface ConversionsEditorProps {
  rows: ConversionRow[];
  onChange: (rows: ConversionRow[]) => void;
  units: Unit[];
  baseUnit: Unit | undefined;
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
}

/// Unit conversions of a raw material ("1 sac = 50 kg"): one row per
/// purchase unit with its factor to the base unit (07 section 4.1).
export function ConversionsEditor({
  rows,
  onChange,
  units,
  baseUnit,
  errors = {},
  disabled,
}: ConversionsEditorProps) {
  const update = (index: number, patch: Partial<ConversionRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const options = units
    .filter((unit) => unit.id !== baseUnit?.id)
    .map((unit) => ({
      value: unit.id,
      label: `${unit.name} (${unit.symbol})`,
    }));

  return (
    <div className={styles.root}>
      <ul className={styles.rows}>
        {rows.map((row, index) => {
          const unit = units.find((item) => item.id === row.unitId);

          return (
            <li key={index} className={styles.row}>
              <span className={styles.one}>1</span>
              <Select
                aria-label={`Unité de conversion ${index + 1}`}
                placeholder="Unité"
                options={options}
                value={row.unitId || null}
                onValueChange={(unitId) =>
                  update(index, { unitId: unitId ?? "" })
                }
                disabled={disabled}
                invalid={Boolean(errors[`conversions.${index}.unitId`])}
              />
              <span className={styles.equals}>=</span>
              <NumberInput
                aria-label={`Facteur ${index + 1}`}
                value={row.factorToBase}
                onChange={(factorToBase) => update(index, { factorToBase })}
                decimals={6}
                suffix={baseUnit?.symbol}
                disabled={disabled}
                invalid={Boolean(errors[`conversions.${index}.factorToBase`])}
              />
              <IconButton
                label={`${fr.remove} la conversion ${index + 1}`}
                icon={<Trash2 />}
                size="sm"
                variant="danger"
                disabled={disabled}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              />
              {unit && row.factorToBase ? (
                <span className={styles.preview}>
                  1 {unit.symbol} = {row.factorToBase.replace(".", ",")}{" "}
                  {baseUnit?.symbol}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {errors.conversions ? (
        <p className={styles.error}>{errors.conversions}</p>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Plus />}
        disabled={disabled || options.length === 0}
        onClick={() => onChange([...rows, { unitId: "", factorToBase: "" }])}
      >
        Ajouter une conversion
      </Button>
    </div>
  );
}

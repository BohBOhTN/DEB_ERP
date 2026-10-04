import { cx } from "../../../lib/cx.js";
import { formatDate } from "../../../i18n/format.js";
import {
  periodCaption,
  periodLabels,
  periodPresets,
  periodRange,
  type PeriodPreset,
  type PeriodValue,
} from "../../../lib/dates/periodRange.js";
import { useIsPhone } from "../../../lib/hooks/useBreakpoint.js";
import { DateInput } from "../../ui/DateInput/DateInput.js";
import { SegmentedControl } from "../../ui/SegmentedControl/SegmentedControl.js";
import styles from "./PeriodFilter.module.css";

export interface PeriodFilterProps {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  label?: string;
  /// The presets offered; the list presets by default, the analysis ones
  /// (`analysisPeriodPresets`) on a page that reads a trend.
  presets?: PeriodPreset[];
  className?: string;
}

/// The one period control of every list with a date dimension (issue #41):
/// `Aujourd'hui | Hier | Cette semaine | Ce mois | Personnalisée`, the last
/// one revealing "Du" and "Au" (one date is a single day), and a caption
/// with the business days the list covers. The page keeps the value in the
/// URL and resolves it with `periodRange`.
export function PeriodFilter({
  value,
  onChange,
  label = "Période",
  presets = periodPresets,
  className,
}: PeriodFilterProps) {
  const isPhone = useIsPhone();
  const range = periodRange(value);

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.controls}>
        <SegmentedControl<PeriodPreset>
          label={label}
          size={isPhone ? "sm" : "md"}
          fullWidth={isPhone}
          className={styles.segments}
          value={value.preset}
          onValueChange={(preset) =>
            onChange(
              preset === "custom"
                ? {
                    preset,
                    // Start the custom range from what was shown.
                    from: value.from || range.from,
                    to: value.to || range.to,
                  }
                : { preset, from: "", to: "" },
            )
          }
          options={presets.map((preset) => ({
            value: preset,
            label: periodLabels[preset],
          }))}
        />
        {value.preset === "custom" ? (
          <div className={styles.range}>
            <DateInput
              aria-label="Du"
              value={value.from}
              max={value.to || undefined}
              onChange={(from) => onChange({ ...value, from })}
            />
            <DateInput
              aria-label="Au"
              value={value.to}
              min={value.from || undefined}
              onChange={(to) => onChange({ ...value, to })}
            />
          </div>
        ) : null}
      </div>
      <p className={styles.caption} aria-live="polite">
        {periodCaption(range, formatDate)}
      </p>
    </div>
  );
}

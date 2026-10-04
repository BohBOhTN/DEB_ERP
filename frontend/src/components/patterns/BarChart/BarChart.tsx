import { useId, useState } from "react";
import { cx } from "../../../lib/cx.js";
import { useIsPhone } from "../../../lib/hooks/useBreakpoint.js";
import styles from "./BarChart.module.css";

/// Column labels that fit under a vertical chart without touching: a phone
/// has room for about eight, wider screens for every hour of a day.
const maxColumnLabels = { phone: 8, wide: 24 };

export interface BarDatum {
  label: string;
  value: number;
  /// Preformatted value for the tooltip and the accessible label.
  formatted: string;
  href?: string;
}

export interface BarChartProps {
  title: string;
  data: BarDatum[];
  /// Index of the highlighted bar (the largest by default).
  highlightIndex?: number;
  /// `horizontal` for "top categories" lists, `vertical` for time series.
  orientation?: "horizontal" | "vertical";
  height?: number;
  className?: string;
}

/// Accessible bars, tokens only (05 section 3.2). Each bar is a focusable
/// element with its own label, so keyboard and screen-reader users read
/// the same figures as everyone else. A vertical chart also writes the bar
/// that is hovered, focused or tapped in a line under the columns (the
/// highest one until then), because a finger has no hover and no tooltip.
export function BarChart({
  title,
  data,
  highlightIndex,
  orientation = "horizontal",
  height = 220,
  className,
}: BarChartProps) {
  const titleId = useId();
  const isPhone = useIsPhone();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((item) => item.value));
  const highlighted =
    highlightIndex ??
    data.reduce(
      (best, item, index) =>
        item.value > (data[best]?.value ?? -Infinity) ? index : best,
      0,
    );

  if (orientation === "horizontal") {
    return (
      <div
        className={cx(styles.root, className)}
        role="figure"
        aria-labelledby={titleId}
      >
        <p className="visually-hidden" id={titleId}>
          {title}
        </p>
        <ul className={styles.rows}>
          {data.map((item, index) => (
            <li key={`${item.label}-${index}`} className={styles.row}>
              <span className={styles.rowLabel}>{item.label}</span>
              <div className={styles.track} aria-hidden="true">
                <div
                  className={cx(
                    styles.bar,
                    index === highlighted && styles.highlight,
                  )}
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </div>
              <span
                className={cx(styles.rowValue, "tabular-nums")}
                aria-label={`${item.label} : ${item.formatted}`}
              >
                {item.formatted}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // With many columns only every second or third label is printed; every
  // bar keeps its own accessible label and its line in the readout.
  const labelStep = Math.ceil(
    data.length / (isPhone ? maxColumnLabels.phone : maxColumnLabels.wide),
  );
  const shown = data[active ?? highlighted];

  return (
    <div
      className={cx(styles.root, className)}
      role="figure"
      aria-labelledby={titleId}
    >
      <p className="visually-hidden" id={titleId}>
        {title}
      </p>
      <div
        className={cx(styles.vertical, data.length > 12 && styles.dense)}
        style={{ height }}
      >
        {data.map((item, index) => (
          <button
            key={`${item.label}-${index}`}
            type="button"
            className={cx(
              styles.column,
              index === highlighted && item.value > 0 && styles.highlight,
              index === active && styles.active,
            )}
            aria-label={`${item.label} : ${item.formatted}`}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onClick={() => setActive(index)}
          >
            <span
              className={cx(
                styles.columnBar,
                item.value <= 0 && styles.columnEmpty,
              )}
              style={{ height: `${(Math.max(0, item.value) / max) * 100}%` }}
            />
            {index % labelStep === 0 ? (
              <span className={styles.columnLabel} aria-hidden="true">
                {item.label}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {shown ? (
        <p className={styles.readout} aria-live="polite">
          <strong>{shown.label}</strong>
          {` : ${shown.formatted}`}
        </p>
      ) : null}
    </div>
  );
}

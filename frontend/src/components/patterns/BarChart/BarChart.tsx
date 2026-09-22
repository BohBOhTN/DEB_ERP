import { useId } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./BarChart.module.css";

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

/// Accessible SVG bars, tokens only (05 section 3.2). Each bar is a
/// focusable element with its own label, so keyboard and screen-reader
/// users read the same figures as everyone else.
export function BarChart({
  title,
  data,
  highlightIndex,
  orientation = "horizontal",
  height = 220,
  className,
}: BarChartProps) {
  const titleId = useId();
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

  const barWidth = 100 / Math.max(1, data.length);

  return (
    <div
      className={cx(styles.root, className)}
      role="figure"
      aria-labelledby={titleId}
    >
      <p className="visually-hidden" id={titleId}>
        {title}
      </p>
      <div className={styles.vertical} style={{ height }}>
        {data.map((item, index) => (
          <button
            key={`${item.label}-${index}`}
            type="button"
            className={cx(
              styles.column,
              index === highlighted && styles.highlight,
            )}
            style={{ width: `${barWidth}%` }}
            aria-label={`${item.label} : ${item.formatted}`}
            title={`${item.label} : ${item.formatted}`}
          >
            <span
              className={styles.columnBar}
              style={{ height: `${(item.value / max) * 100}%` }}
            />
            <span className={styles.columnLabel} aria-hidden="true">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

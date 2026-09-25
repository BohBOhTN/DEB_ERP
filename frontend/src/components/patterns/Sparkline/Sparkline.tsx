import { useId } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./Sparkline.module.css";

export interface SparklineProps {
  title: string;
  values: number[];
  /// Text summary for assistive technology: "30 derniers jours, 1 250 TND au total".
  summary?: string;
  width?: number;
  height?: number;
  tone?: "primary" | "accent";
  className?: string;
}

/// Tiny trend line for the `Dépenses du mois` tile (05 section 3.2).
export function Sparkline({
  title,
  values,
  summary,
  width = 160,
  height = 40,
  tone = "primary",
  className,
}: SparklineProps) {
  const titleId = useId();
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map(
    (value, index) =>
      `${(index * step).toFixed(1)},${(height - ((value - min) / range) * height).toFixed(1)}`,
  );
  const line = points.join(" ");
  const area = `0,${height} ${line} ${((values.length - 1) * step).toFixed(1)},${height}`;

  return (
    <svg
      className={cx(styles.root, styles[tone], className)}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-labelledby={titleId}
      preserveAspectRatio="none"
    >
      <title id={titleId}>{summary ? `${title}. ${summary}` : title}</title>
      {values.length > 1 ? (
        <polygon className={styles.area} points={area} />
      ) : null}
      <polyline
        className={styles.line}
        points={line}
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

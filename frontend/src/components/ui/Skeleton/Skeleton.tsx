import { cx } from "../../../lib/cx.js";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  variant?: "text" | "rect" | "circle" | "table" | "kpi";
  width?: number | string;
  height?: number | string;
  /// Rows for the `table` variant.
  rows?: number;
  className?: string;
}

/// Loading placeholder that matches the final layout (05 section 3.3,
/// state 1). Always `aria-busy`; never the only content of a page for long.
export function Skeleton({
  variant = "text",
  width,
  height,
  rows = 5,
  className,
}: SkeletonProps) {
  if (variant === "table") {
    return (
      <div
        className={cx(styles.table, className)}
        aria-busy="true"
        aria-label="Chargement"
      >
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={styles.tableRow}>
            <span
              className={cx(styles.block, styles.shimmer)}
              style={{ width: "32%" }}
            />
            <span
              className={cx(styles.block, styles.shimmer)}
              style={{ width: "20%" }}
            />
            <span
              className={cx(styles.block, styles.shimmer)}
              style={{ width: "16%" }}
            />
            <span
              className={cx(styles.block, styles.shimmer)}
              style={{ width: "12%" }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "kpi") {
    return (
      <div
        className={cx(styles.kpi, className)}
        aria-busy="true"
        aria-label="Chargement"
      >
        <span
          className={cx(styles.block, styles.shimmer)}
          style={{ width: "40%", height: 12 }}
        />
        <span
          className={cx(styles.block, styles.shimmer)}
          style={{ width: "70%", height: 32 }}
        />
        <span
          className={cx(styles.block, styles.shimmer)}
          style={{ width: "50%", height: 12 }}
        />
      </div>
    );
  }

  return (
    <span
      className={cx(styles.block, styles.shimmer, styles[variant], className)}
      style={{ width, height }}
      aria-busy="true"
      aria-hidden="true"
    />
  );
}

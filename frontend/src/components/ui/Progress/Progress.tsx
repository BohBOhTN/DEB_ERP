import { cx } from "../../../lib/cx.js";
import styles from "./Progress.module.css";

export interface ProgressProps {
  /// 0 to 100; omitted for the indeterminate top bar used on background refresh.
  value?: number;
  label: string;
  tone?: "primary" | "accent" | "success" | "danger";
  size?: "sm" | "md";
  className?: string;
}

export function Progress({
  value,
  label,
  tone = "primary",
  size = "md",
  className,
}: ProgressProps) {
  const clamped =
    value === undefined ? undefined : Math.min(100, Math.max(0, value));

  return (
    <div
      className={cx(
        styles.root,
        styles[size],
        clamped === undefined && styles.indeterminate,
        className,
      )}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <div
        className={cx(styles.bar, styles[tone])}
        style={clamped === undefined ? undefined : { width: `${clamped}%` }}
      />
    </div>
  );
}

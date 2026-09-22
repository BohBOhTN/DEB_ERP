import { cx } from "../../../lib/cx.js";
import styles from "./Spinner.module.css";

export interface SpinnerProps {
  size?: number;
  /// Announced label when the spinner stands alone; omitted inside a button
  /// that already carries `aria-busy`.
  label?: string;
  className?: string;
}

export function Spinner({ size = 20, label, className }: SpinnerProps) {
  return (
    <svg
      className={cx(styles.root, className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle className={styles.track} cx="12" cy="12" r="9" strokeWidth="3" />
      <path
        className={styles.head}
        d="M21 12a9 9 0 0 0-9-9"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

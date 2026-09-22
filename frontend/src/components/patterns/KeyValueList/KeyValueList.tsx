import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./KeyValueList.module.css";

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  /// Money and quantities: right-aligned tabular numerals.
  numeric?: boolean;
}

export interface KeyValueListProps {
  items: KeyValueItem[];
  columns?: 1 | 2;
  className?: string;
}

/// Label/value rows: two columns on desktop, stacked on phone.
export function KeyValueList({
  items,
  columns = 2,
  className,
}: KeyValueListProps) {
  return (
    <dl className={cx(styles.root, columns === 1 && styles.single, className)}>
      {items.map((item, index) => (
        <div key={index} className={styles.row}>
          <dt className={styles.label}>{item.label}</dt>
          <dd
            className={cx(
              styles.value,
              item.numeric && "tabular-nums",
              item.numeric && styles.numeric,
            )}
          >
            {item.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

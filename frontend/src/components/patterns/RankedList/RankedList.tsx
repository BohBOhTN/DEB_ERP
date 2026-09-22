import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./RankedList.module.css";

export interface RankedItem {
  label: ReactNode;
  value: number;
  formatted: string;
  href?: string;
}

export interface RankedListProps {
  title: string;
  items: RankedItem[];
  className?: string;
}

/// "Top products": rank chip, label, value and a track bar relative to the
/// first item (05 section 3.2).
export function RankedList({ title, items, className }: RankedListProps) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <ol className={cx(styles.root, className)} aria-label={title}>
      {items.map((item, index) => (
        <li key={index} className={styles.item}>
          <span
            className={cx(styles.rank, index === 0 && styles.first)}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <div className={styles.body}>
            <div className={styles.row}>
              <span className={styles.label}>
                {item.href ? <a href={item.href}>{item.label}</a> : item.label}
              </span>
              <span className={cx(styles.value, "tabular-nums")}>
                {item.formatted}
              </span>
            </div>
            <div className={styles.track} aria-hidden="true">
              <div
                className={styles.bar}
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

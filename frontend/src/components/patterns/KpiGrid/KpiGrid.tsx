import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./KpiGrid.module.css";

export interface KpiGridProps {
  /// Columns on wide screens; 2-up on tablets, 2-up on phones, 1-up under 360 px.
  columns?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}

export function KpiGrid({ columns = 4, children, className }: KpiGridProps) {
  return (
    <div className={cx(styles.root, styles[`cols${columns}`], className)}>
      {children}
    </div>
  );
}

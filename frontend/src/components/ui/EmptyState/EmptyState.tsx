import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  icon?: ReactNode;
  /// Says what is empty: "Aucun fournisseur".
  title: string;
  /// Says what to do next: "Ajoutez votre premier fournisseur pour ...".
  description?: string;
  action?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  className,
}: EmptyStateProps) {
  return (
    <div className={cx(styles.root, styles[size], className)}>
      {icon ? (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}

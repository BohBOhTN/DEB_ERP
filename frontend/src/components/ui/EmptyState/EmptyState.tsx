import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import {
  Illustration,
  type IllustrationName,
} from "../Illustration/Illustration.js";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  icon?: ReactNode;
  /// A line-art drawing instead of the icon disc (UI-23).
  illustration?: IllustrationName;
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
  illustration,
  title,
  description,
  action,
  size = "md",
  className,
}: EmptyStateProps) {
  return (
    <div className={cx(styles.root, styles[size], className)}>
      {illustration ? (
        <Illustration
          name={illustration}
          size={size === "sm" ? 72 : 112}
          className={styles.illustration}
        />
      ) : icon ? (
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

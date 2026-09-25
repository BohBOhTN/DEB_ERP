import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { Sheet } from "../../ui/Sheet/Sheet.js";
import styles from "./DetailPanel.module.css";

export interface DetailPanelProps {
  title: ReactNode;
  /// Reference and status live next to the title: "AC-000012", `StatusPill`.
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /// `sheet` opens a right-hand panel over a list; `page` renders inline as
  /// the body of a route.
  mode?: "sheet" | "page";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

/// Detail of a customer, supplier, purchase, order or sale (05 section 3.2).
export function DetailPanel({
  title,
  meta,
  description,
  actions,
  mode = "page",
  open = false,
  onOpenChange,
  children,
  className,
}: DetailPanelProps) {
  const header = (
    <div className={styles.header}>
      <div className={styles.titleRow}>
        <h2 className={styles.title}>{title}</h2>
        {meta ? <div className={styles.meta}>{meta}</div> : null}
      </div>
      {description ? <p className={styles.description}>{description}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );

  if (mode === "sheet") {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => onOpenChange?.(next)}
        title={title}
        description={description}
        footer={actions}
      >
        {meta ? <div className={styles.sheetMeta}>{meta}</div> : null}
        <div className={styles.body}>{children}</div>
      </Sheet>
    );
  }

  return (
    <section
      className={cx(styles.root, className)}
      aria-label={typeof title === "string" ? title : undefined}
    >
      {header}
      <div className={styles.body}>{children}</div>
    </section>
  );
}

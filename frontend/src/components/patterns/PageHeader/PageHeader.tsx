import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { fr } from "../../../i18n/fr.js";
import styles from "./PageHeader.module.css";

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  /// The first action is the primary one; on phones the others collapse
  /// under the overflow the caller provides as `overflow`.
  actions?: ReactNode;
  overflow?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  /// Shown next to the title while a V1 screen is mounted (ADR-V2-003).
  badge?: ReactNode;
  className?: string;
}

/// One `h1` per page (05 section 5), eyebrow above, actions on the right.
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  overflow,
  breadcrumbs,
  badge,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx(styles.root, className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav className={styles.breadcrumbs} aria-label={fr.breadcrumbs}>
          <ol>
            {breadcrumbs.map((crumb, index) => {
              const last = index === breadcrumbs.length - 1;

              return (
                <li key={`${crumb.label}-${index}`}>
                  {crumb.href && !last ? (
                    <a href={crumb.href}>{crumb.label}</a>
                  ) : (
                    <span aria-current={last ? "page" : undefined}>
                      {crumb.label}
                    </span>
                  )}
                  {last ? null : <ChevronRight aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}
      <div className={styles.row}>
        <div className={styles.text}>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {badge}
          </div>
          {description ? (
            <p className={styles.description}>{description}</p>
          ) : null}
        </div>
        {actions || overflow ? (
          <div className={styles.actions}>
            {actions}
            {overflow}
          </div>
        ) : null}
      </div>
    </header>
  );
}

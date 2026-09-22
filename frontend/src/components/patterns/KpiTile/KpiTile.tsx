import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { Skeleton } from "../../ui/Skeleton/Skeleton.js";
import styles from "./KpiTile.module.css";

export interface KpiDelta {
  /// Signed percentage or absolute change, already formatted ("+12 %").
  label: string;
  direction: "up" | "down" | "flat";
  /// Whether "up" is good; receivables going up is not.
  positiveIsGood?: boolean;
}

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  delta?: KpiDelta;
  note?: ReactNode;
  /// Solid navy tile with a gold icon chip (05 section 3.2).
  featured?: boolean;
  loading?: boolean;
  /// Small badge in the corner: overdue count on payables.
  badge?: ReactNode;
  href?: string;
  className?: string;
}

export function KpiTile({
  label,
  value,
  unit,
  icon,
  delta,
  note,
  featured = false,
  loading = false,
  badge,
  href,
  className,
}: KpiTileProps) {
  if (loading) {
    return <Skeleton variant="kpi" className={className} />;
  }

  const DeltaIcon =
    delta?.direction === "up"
      ? ArrowUpRight
      : delta?.direction === "down"
        ? ArrowDownRight
        : Minus;
  const deltaGood =
    delta && delta.direction !== "flat"
      ? (delta.direction === "up") === (delta.positiveIsGood ?? true)
      : undefined;
  const Wrapper = href ? "a" : "div";

  return (
    <Wrapper
      href={href}
      className={cx(
        styles.root,
        featured && styles.featured,
        href && styles.link,
        className,
      )}
    >
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {icon ? (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <div className={styles.valueRow}>
        <span className={cx(styles.value, "tabular-nums")}>{value}</span>
        {unit ? <span className={styles.unit}>{unit}</span> : null}
        {badge ? <span className={styles.badge}>{badge}</span> : null}
      </div>
      {delta || note ? (
        <div className={styles.bottom}>
          {delta ? (
            <span
              className={cx(
                styles.delta,
                deltaGood === true && styles.good,
                deltaGood === false && styles.bad,
              )}
            >
              <DeltaIcon aria-hidden="true" />
              {delta.label}
            </span>
          ) : null}
          {note ? <span className={styles.note}>{note}</span> : null}
        </div>
      ) : null}
    </Wrapper>
  );
}

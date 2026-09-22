import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./Badge.module.css";

export type BadgeTone =
  "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
}

/// Soft background, strong text, always with a label: status is never colour
/// alone (05 section 5).
export function Badge({
  tone = "neutral",
  icon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={cx(styles.root, styles[tone], className)} {...rest}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

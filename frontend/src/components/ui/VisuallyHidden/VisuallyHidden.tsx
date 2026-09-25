import type { HTMLAttributes } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./VisuallyHidden.module.css";

/// Text for screen readers only (table header labels in card mode, live
/// announcements).
export function VisuallyHidden({
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx(styles.root, className)} {...rest} />;
}

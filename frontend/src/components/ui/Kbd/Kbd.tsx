import type { HTMLAttributes } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./Kbd.module.css";

/// Keyboard shortcut hint for the desktop POS (`/`, `F2`, `F9`).
export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <kbd className={cx(styles.root, className)} {...rest} />;
}

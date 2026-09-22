import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { Spinner } from "../Spinner/Spinner.js";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  /// The accessible name; icon-only buttons never rely on the icon alone.
  label: string;
  icon: ReactNode;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary" | "primary" | "danger";
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      icon,
      size = "md",
      variant = "ghost",
      loading,
      className,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cx(styles.root, styles[size], styles[variant], className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        <span className={styles.icon} aria-hidden="true">
          {loading ? <Spinner size={16} /> : icon}
        </span>
      </button>
    );
  },
);

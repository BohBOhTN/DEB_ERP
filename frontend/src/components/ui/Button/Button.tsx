import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { Spinner } from "../Spinner/Spinner.js";
import styles from "./Button.module.css";

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /// Disables the button and shows a spinner while keeping its width, so a
  /// pending posting cannot be double-submitted (05 section 3.3, state 8).
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className,
      children,
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
        className={cx(
          styles.root,
          styles[variant],
          styles[size],
          fullWidth && styles.fullWidth,
          loading && styles.loading,
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        {...rest}
      >
        {loading ? (
          <span className={styles.spinner} aria-hidden="true">
            <Spinner size={size === "sm" ? 14 : 18} />
          </span>
        ) : null}
        <span className={styles.content}>
          {leftIcon ? (
            <span className={styles.icon} aria-hidden="true">
              {leftIcon}
            </span>
          ) : null}
          {children}
          {rightIcon ? (
            <span className={styles.icon} aria-hidden="true">
              {rightIcon}
            </span>
          ) : null}
        </span>
      </button>
    );
  },
);

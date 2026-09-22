import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { useFormField } from "../FormField/FormField.js";
import styles from "./TextInput.module.css";

export interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "prefix"
> {
  prefix?: ReactNode;
  suffix?: ReactNode;
  invalid?: boolean;
  align?: "left" | "right";
}

/// 44 px tall, 16 px font so iOS does not zoom (05 section 2.2).
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput(
    { prefix, suffix, invalid, align = "left", className, id, ...rest },
    ref,
  ) {
    const field = useFormField();
    const isInvalid = invalid ?? field?.invalid ?? false;

    return (
      <div
        className={cx(
          styles.root,
          isInvalid && styles.invalid,
          rest.disabled && styles.disabled,
          className,
        )}
      >
        {prefix ? (
          <span className={styles.affix} aria-hidden="true">
            {prefix}
          </span>
        ) : null}
        <input
          ref={ref}
          id={id ?? field?.id}
          className={cx(styles.input, align === "right" && styles.right)}
          aria-invalid={isInvalid || undefined}
          aria-required={field?.required || undefined}
          aria-describedby={rest["aria-describedby"] ?? field?.describedBy}
          {...rest}
        />
        {suffix ? (
          <span className={styles.affix} aria-hidden="true">
            {suffix}
          </span>
        ) : null}
      </div>
    );
  },
);

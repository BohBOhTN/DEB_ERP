import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cx } from "../../../lib/cx.js";
import { useFormField } from "../FormField/FormField.js";
import styles from "./TextArea.module.css";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ invalid, className, id, rows = 3, ...rest }, ref) {
    const field = useFormField();
    const isInvalid = invalid ?? field?.invalid ?? false;

    return (
      <textarea
        ref={ref}
        id={id ?? field?.id}
        rows={rows}
        className={cx(styles.root, isInvalid && styles.invalid, className)}
        aria-invalid={isInvalid || undefined}
        aria-required={field?.required || undefined}
        aria-describedby={rest["aria-describedby"] ?? field?.describedBy}
        {...rest}
      />
    );
  },
);

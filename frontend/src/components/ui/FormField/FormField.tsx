import { createContext, useContext, useId, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./FormField.module.css";

export interface FormFieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/// Inputs rendered inside a `FormField` pick up its id, description and
/// error state, so a screen writes the label and the error once.
export function useFormField(): FormFieldContextValue | null {
  return useContext(FormFieldContext);
}

export interface FormFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /// French error text; the field becomes `aria-invalid` and the message is
  /// announced politely.
  error?: ReactNode;
  required?: boolean;
  /// Overrides the generated id; use it when the input is external.
  htmlFor?: string;
  /// `false` renders the label as plain text (for groups of radios).
  labelIsElement?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  labelIsElement = true,
  children,
  className,
}: FormFieldProps) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <FormFieldContext.Provider
      value={{ id, describedBy, invalid: Boolean(error), required }}
    >
      <div
        className={cx(
          styles.root,
          error ? styles.invalid : undefined,
          className,
        )}
      >
        {labelIsElement ? (
          <label className={styles.label} htmlFor={id}>
            {label}
            {required ? (
              <span className={styles.required} aria-hidden="true">
                *
              </span>
            ) : null}
          </label>
        ) : (
          <span className={styles.label} id={`${id}-label`}>
            {label}
            {required ? (
              <span className={styles.required} aria-hidden="true">
                *
              </span>
            ) : null}
          </span>
        )}
        {children}
        {hint ? (
          <p className={styles.hint} id={hintId}>
            {hint}
          </p>
        ) : null}
        {error ? (
          <p className={styles.error} id={errorId} aria-live="polite">
            {error}
          </p>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  );
}

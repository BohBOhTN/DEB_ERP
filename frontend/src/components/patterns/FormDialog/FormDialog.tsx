import { useState, type ReactNode } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { ApiError } from "../../../lib/api/errors.js";
import { applyFieldErrors } from "../../../lib/forms/applyFieldErrors.js";
import { describeError } from "../../../i18n/errors.js";
import { fr } from "../../../i18n/fr.js";
import { Button } from "../../ui/Button/Button.js";
import { Dialog, type DialogSize } from "../../ui/Dialog/Dialog.js";
import styles from "./FormDialog.module.css";

export interface FormDialogProps<
  TFieldValues extends FieldValues,
  TTransformed = TFieldValues,
> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: DialogSize;
  form: UseFormReturn<TFieldValues, unknown, TTransformed>;
  /// Runs the mutation; an `ApiError` with `fieldErrors` is mapped onto the
  /// fields, a `VERSION_CONFLICT` shows the reload prompt, anything else
  /// goes to the summary (06 section 3.4).
  onSubmit: (values: TTransformed) => Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  /// Reload handler for a stale-version conflict.
  onReload?: () => void;
  children: ReactNode;
}

export function FormDialog<
  TFieldValues extends FieldValues,
  TTransformed = TFieldValues,
>({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  form,
  onSubmit,
  submitLabel = fr.save,
  cancelLabel = fr.cancel,
  onReload,
  children,
}: FormDialogProps<TFieldValues, TTransformed>) {
  const [summary, setSummary] = useState<{
    title: string;
    description: string;
    conflict: boolean;
  } | null>(null);
  const pending = form.formState.isSubmitting;

  const submit = form.handleSubmit(async (values) => {
    setSummary(null);

    try {
      await onSubmit(values);
    } catch (error) {
      if (error instanceof ApiError && error.isValidation) {
        const unknown = applyFieldErrors(form.setError, error.fieldErrors);

        if (unknown.length > 0) {
          setSummary({
            title: fr.formHasErrors,
            description: unknown.join(" "),
            conflict: false,
          });
        }

        return;
      }

      const copy = describeError(error);
      setSummary({
        ...copy,
        conflict: error instanceof ApiError && error.isVersionConflict,
      });
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSummary(null);
        }
        onOpenChange(next);
      }}
      title={title}
      description={description}
      size={size}
      preventClose={pending}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button type="submit" form={`${title}-form`} loading={pending}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={`${title}-form`}
        className={styles.form}
        onSubmit={submit}
        noValidate
      >
        {summary ? (
          <div className={styles.summary} role="alert">
            <strong>{summary.title}</strong>
            <span>{summary.description}</span>
            {summary.conflict && onReload ? (
              <Button variant="link" size="sm" onClick={onReload}>
                {fr.reload}
              </Button>
            ) : null}
          </div>
        ) : null}
        {children}
      </form>
    </Dialog>
  );
}

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useId, useState, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { fr } from "../../../i18n/fr.js";
import { Button } from "../Button/Button.js";
import { FormField } from "../FormField/FormField.js";
import { TextArea } from "../TextArea/TextArea.js";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /// Mandatory: lists the stock, balance, payment and status effects in
  /// French (V1 confirmation rule, 05 section 3.1).
  impact: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /// Adds a required reason field (5 to 300 characters) passed to `onConfirm`.
  requireReason?: boolean;
  loading?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

const reasonMin = 5;
const reasonMax = 300;

export function ConfirmDialog({
  open,
  loading = false,
  onCancel,
  ...body
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => (!next && !loading ? onCancel() : undefined)}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        {/* The content unmounts when the dialog closes, which resets the
            reason field for the next confirmation. */}
        <ConfirmDialogContent loading={loading} {...body} />
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function ConfirmDialogContent({
  title,
  impact,
  confirmLabel = fr.confirm,
  cancelLabel = fr.cancel,
  tone = "default",
  requireReason = false,
  loading = false,
  onConfirm,
}: Omit<ConfirmDialogProps, "open" | "onCancel">) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const impactId = useId();

  const trimmed = reason.trim();
  const reasonError =
    requireReason &&
    touched &&
    (trimmed.length < reasonMin || trimmed.length > reasonMax)
      ? `Saisissez un motif de ${reasonMin} à ${reasonMax} caractères.`
      : undefined;
  const canConfirm =
    !loading &&
    (!requireReason ||
      (trimmed.length >= reasonMin && trimmed.length <= reasonMax));

  const confirm = () => {
    setTouched(true);

    if (!canConfirm) {
      return;
    }

    onConfirm(requireReason ? trimmed : undefined);
  };

  return (
    <AlertDialog.Content
      className={styles.content}
      aria-describedby={impactId}
      onEscapeKeyDown={(event) => loading && event.preventDefault()}
    >
      <AlertDialog.Title className={styles.title}>{title}</AlertDialog.Title>
      <div
        className={cx(styles.impact, tone === "danger" && styles.danger)}
        id={impactId}
      >
        <p className={styles.impactLabel}>{fr.impact}</p>
        <div className={styles.impactBody}>{impact}</div>
      </div>
      {requireReason ? (
        <FormField label={fr.reason} error={reasonError} required>
          <TextArea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={fr.reasonPlaceholder}
            disabled={loading}
            rows={3}
          />
        </FormField>
      ) : null}
      <div className={styles.actions}>
        <AlertDialog.Cancel asChild>
          <Button variant="secondary" disabled={loading}>
            {cancelLabel}
          </Button>
        </AlertDialog.Cancel>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          loading={loading}
          onClick={confirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </AlertDialog.Content>
  );
}

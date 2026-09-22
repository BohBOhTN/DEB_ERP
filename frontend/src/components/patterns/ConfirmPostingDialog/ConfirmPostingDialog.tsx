import { useEffect, useRef, useState } from "react";
import { createIdempotencyKey } from "../../../lib/api/idempotency.js";
import { ApiError } from "../../../lib/api/errors.js";
import { describeError } from "../../../i18n/errors.js";
import {
  ConfirmDialog,
  type ConfirmDialogProps,
} from "../../ui/ConfirmDialog/ConfirmDialog.js";

export interface ConfirmPostingDialogProps extends Omit<
  ConfirmDialogProps,
  "onConfirm" | "loading"
> {
  /// Runs the posting command with the key generated for this intent. The
  /// same key is reused when the user retries after a network failure, so a
  /// command that reached the server cannot post twice (06 section 3.4).
  onPost: (idempotencyKey: string, reason?: string) => Promise<void>;
  onPosted?: () => void;
}

export function ConfirmPostingDialog({
  open,
  onPost,
  onPosted,
  onCancel,
  ...rest
}: ConfirmPostingDialogProps) {
  const keyRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // A closed dialog is a finished intent; the next one gets a fresh key.
      keyRef.current = null;
    }
  }, [open]);

  const confirm = async (reason?: string) => {
    keyRef.current ??= createIdempotencyKey();
    setLoading(true);
    setFailure(null);

    try {
      await onPost(keyRef.current, reason);
      keyRef.current = null;
      onPosted?.();
    } catch (error) {
      const copy = describeError(error);
      const retryable =
        error instanceof ApiError && (error.isNetwork || error.status >= 500);
      setFailure(
        retryable
          ? `${copy.description} La même demande sera renvoyée, sans doublon.`
          : copy.description,
      );

      if (!retryable) {
        keyRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmDialog
      {...rest}
      open={open}
      loading={loading}
      onCancel={() => {
        setFailure(null);
        onCancel();
      }}
      impact={
        <>
          {rest.impact}
          {failure ? (
            <p
              role="alert"
              style={{
                marginTop: "var(--space-2)",
                fontWeight: "var(--weight-title)",
              }}
            >
              {failure}
            </p>
          ) : null}
        </>
      }
      onConfirm={(reason) => void confirm(reason)}
    />
  );
}

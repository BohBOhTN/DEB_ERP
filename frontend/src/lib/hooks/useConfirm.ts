import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface ConfirmRequest {
  title: string;
  impact: ReactNode;
  confirmLabel?: string;
  tone?: "default" | "danger";
  requireReason?: boolean;
}

export interface ConfirmResult {
  confirmed: boolean;
  reason?: string;
}

export interface ConfirmDialogState extends ConfirmRequest {
  open: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

/// Promise-based confirmation: `const { confirmed } = await confirm({...})`.
/// The returned `dialog` props are handed to `ConfirmDialog`, which keeps
/// the visual contract (mandatory impact block) in one place.
export function useConfirm(): {
  confirm: (request: ConfirmRequest) => Promise<ConfirmResult>;
  dialog: ConfirmDialogState;
} {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((result: ConfirmResult) => void) | null>(null);

  const settle = useCallback((result: ConfirmResult) => {
    resolver.current?.(result);
    resolver.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback(
    (next: ConfirmRequest) =>
      new Promise<ConfirmResult>((resolve) => {
        resolver.current?.({ confirmed: false });
        resolver.current = resolve;
        setRequest(next);
      }),
    [],
  );

  return {
    confirm,
    dialog: {
      open: request !== null,
      title: request?.title ?? "",
      impact: request?.impact ?? null,
      confirmLabel: request?.confirmLabel,
      tone: request?.tone,
      requireReason: request?.requireReason,
      onConfirm: (reason) => settle({ confirmed: true, reason }),
      onCancel: () => settle({ confirmed: false }),
    },
  };
}

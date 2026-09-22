import { useCallback } from "react";
import { describeError } from "../../../i18n/errors.js";
import { useToastStore, type ToastInput } from "./toastStore.js";

export interface ToastApi {
  toast: (input: ToastInput) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  /// French copy for an `ApiError` (or anything else) in one call.
  fromError: (error: unknown) => string;
  dismiss: (id: string) => void;
}

export function useToast(): ToastApi {
  const push = useToastStore((state) => state.push);
  const dismiss = useToastStore((state) => state.dismiss);

  const toast = useCallback((input: ToastInput) => push(input), [push]);

  return {
    toast,
    success: useCallback(
      (title, description) => push({ kind: "success", title, description }),
      [push],
    ),
    error: useCallback(
      (title, description) => push({ kind: "error", title, description }),
      [push],
    ),
    warning: useCallback(
      (title, description) => push({ kind: "warning", title, description }),
      [push],
    ),
    info: useCallback(
      (title, description) => push({ kind: "info", title, description }),
      [push],
    ),
    fromError: useCallback(
      (error) => {
        const copy = describeError(error);

        return push({
          kind: "error",
          title: copy.title,
          description: copy.description,
        });
      },
      [push],
    ),
    dismiss,
  };
}

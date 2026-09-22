import { create } from "zustand";

export type ToastKind = "success" | "error" | "warning" | "info";

export interface ToastInput {
  kind: ToastKind;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /// Errors persist until closed; everything else auto-dismisses after 5 s.
  durationMs?: number;
}

export interface ToastRecord extends ToastInput {
  id: string;
}

interface ToastState {
  toasts: ToastRecord[];
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const maxVisibleToasts = 3;
export const defaultToastDurationMs = 5000;

/// The toast queue is ephemeral UI state, so it lives in Zustand (06
/// section 1). At most three toasts are visible; older ones drop first.
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }].slice(-maxVisibleToasts),
    }));

    return id;
  },
  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  clear: () => set({ toasts: [] }),
}));

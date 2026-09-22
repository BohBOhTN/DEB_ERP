import * as RadixToast from "@radix-ui/react-toast";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cx } from "../../../lib/cx.js";
import { fr } from "../../../i18n/fr.js";
import { IconButton } from "../IconButton/IconButton.js";
import styles from "./Toast.module.css";
import {
  defaultToastDurationMs,
  useToastStore,
  type ToastKind,
  type ToastRecord,
} from "./toastStore.js";

const icons: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

/// Mount once in `app/providers.tsx`. Renders the queue from `useToast()`.
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <RadixToast.Provider swipeDirection="right" label="Notifications">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => dismiss(toast.id)}
        />
      ))}
      <RadixToast.Viewport className={styles.viewport} />
    </RadixToast.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: () => void;
}) {
  const Icon = icons[toast.kind];
  const duration =
    toast.durationMs ??
    (toast.kind === "error" ? Infinity : defaultToastDurationMs);

  return (
    <RadixToast.Root
      className={cx(styles.root, styles[toast.kind])}
      duration={duration}
      onOpenChange={(open) => !open && onDismiss()}
      type={toast.kind === "error" ? "foreground" : "background"}
    >
      <span className={styles.icon} aria-hidden="true">
        <Icon />
      </span>
      <div className={styles.text}>
        <RadixToast.Title className={styles.title}>
          {toast.title}
        </RadixToast.Title>
        {toast.description ? (
          <RadixToast.Description className={styles.description}>
            {toast.description}
          </RadixToast.Description>
        ) : null}
        {toast.action ? (
          <RadixToast.Action asChild altText={toast.action.label}>
            <button
              type="button"
              className={styles.action}
              onClick={toast.action.onClick}
            >
              {toast.action.label}
            </button>
          </RadixToast.Action>
        ) : null}
      </div>
      <RadixToast.Close asChild>
        <IconButton label={fr.close} icon={<X />} size="sm" />
      </RadixToast.Close>
    </RadixToast.Root>
  );
}

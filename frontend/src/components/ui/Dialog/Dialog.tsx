import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { fr } from "../../../i18n/fr.js";
import { IconButton } from "../IconButton/IconButton.js";
import styles from "./Dialog.module.css";

export type DialogSize = "sm" | "md" | "lg" | "full";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  size?: DialogSize;
  footer?: ReactNode;
  /// A pending posting cannot be closed (05 section 3.3, state 8).
  preventClose?: boolean;
  children: ReactNode;
  className?: string;
}

/// Radix dialog: focus trap, `Escape`, focus restore. On phones `size=full`
/// becomes a bottom sheet with a drag handle (05 section 3.1).
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  footer,
  preventClose = false,
  children,
  className,
}: DialogProps) {
  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) =>
        !next && preventClose ? undefined : onOpenChange(next)
      }
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          className={cx(styles.content, styles[size], className)}
          onEscapeKeyDown={(event) => preventClose && event.preventDefault()}
          onPointerDownOutside={(event) =>
            preventClose && event.preventDefault()
          }
          onInteractOutside={(event) => preventClose && event.preventDefault()}
        >
          <div className={styles.handle} aria-hidden="true" />
          <header className={styles.header}>
            <div className={styles.headerText}>
              <RadixDialog.Title className={styles.title}>
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className={styles.description}>
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            {preventClose ? null : (
              <RadixDialog.Close asChild>
                <IconButton label={fr.close} icon={<X />} size="sm" />
              </RadixDialog.Close>
            )}
          </header>
          <div className={styles.body}>{children}</div>
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { fr } from "../../../i18n/fr.js";
import { IconButton } from "../IconButton/IconButton.js";
import styles from "./Sheet.module.css";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /// `right` for detail panels on desktop, `bottom` for filters on phone.
  side?: "right" | "bottom";
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = "right",
  footer,
  children,
  className,
}: SheetProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          className={cx(styles.content, styles[side], className)}
        >
          {side === "bottom" ? (
            <div className={styles.handle} aria-hidden="true" />
          ) : null}
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
            <RadixDialog.Close asChild>
              <IconButton label={fr.close} icon={<X />} size="sm" />
            </RadixDialog.Close>
          </header>
          <div className={styles.body}>{children}</div>
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

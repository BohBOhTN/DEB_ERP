import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./DropdownMenu.module.css";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /// Hidden items are not rendered (permission-gated row actions).
  hidden?: boolean;
  /// Starts a new group with a separator before this item.
  separatorBefore?: boolean;
}

export interface DropdownMenuProps {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  /// Accessible label for the menu itself.
  label?: string;
}

/// Row actions and the top-bar user menu. The trigger is any button
/// (`asChild`); Radix handles roving focus, typeahead and `Escape`.
export function DropdownMenu({
  trigger,
  items,
  align = "end",
  label,
}: DropdownMenuProps) {
  const visible = items.filter((item) => !item.hidden);

  return (
    <RadixMenu.Root modal={false}>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          className={styles.content}
          align={align}
          sideOffset={4}
          aria-label={label}
        >
          {visible.map((item) => (
            <div key={item.id}>
              {item.separatorBefore ? (
                <RadixMenu.Separator className={styles.separator} />
              ) : null}
              <RadixMenu.Item
                className={cx(styles.item, item.danger && styles.danger)}
                disabled={item.disabled}
                onSelect={() => item.onSelect?.()}
              >
                {item.icon ? (
                  <span className={styles.icon} aria-hidden="true">
                    {item.icon}
                  </span>
                ) : null}
                {item.label}
              </RadixMenu.Item>
            </div>
          ))}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

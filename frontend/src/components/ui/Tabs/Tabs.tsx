import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./Tabs.module.css";

export interface TabItem<TValue extends string = string> {
  value: TValue;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<TValue extends string = string> {
  label: string;
  items: TabItem<TValue>[];
  value?: TValue;
  defaultValue?: TValue;
  onValueChange?: (value: TValue) => void;
  className?: string;
}

/// Radix tabs; the tab list scrolls horizontally on phones.
export function Tabs<TValue extends string = string>({
  label,
  items,
  value,
  defaultValue,
  onValueChange,
  className,
}: TabsProps<TValue>) {
  return (
    <RadixTabs.Root
      className={cx(styles.root, className)}
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={(next) => onValueChange?.(next as TValue)}
    >
      <RadixTabs.List className={styles.list} aria-label={label}>
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={styles.trigger}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content
          key={item.value}
          value={item.value}
          className={styles.content}
        >
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

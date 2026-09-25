import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./SegmentedControl.module.css";

export interface SegmentOption<TValue extends string = string> {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<TValue extends string = string> {
  label: string;
  options: SegmentOption<TValue>[];
  value: TValue;
  onValueChange: (value: TValue) => void;
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
}

/// The period picker on `Accueil` and the filter chips on lists. Radio
/// semantics: one tab stop, arrow keys move the selection.
export function SegmentedControl<TValue extends string = string>({
  label,
  options,
  value,
  onValueChange,
  size = "md",
  fullWidth = false,
  className,
}: SegmentedControlProps<TValue>) {
  const groupRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = options.filter((option) => !option.disabled);
    const index = enabled.findIndex((option) => option.value === value);
    let nextIndex = index;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % enabled.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + enabled.length) % enabled.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabled.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const next = enabled[nextIndex];

    if (next) {
      onValueChange(next.value);
      groupRef.current
        ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
        ?.focus();
    }
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      tabIndex={-1}
      aria-label={label}
      className={cx(
        styles.root,
        styles[size],
        fullWidth && styles.fullWidth,
        className,
      )}
      onKeyDown={handleKeyDown}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-value={option.value}
            disabled={option.disabled}
            className={cx(styles.segment, selected && styles.selected)}
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

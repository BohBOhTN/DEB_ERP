import * as RadixRadio from "@radix-ui/react-radio-group";
import { useId, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./RadioGroup.module.css";

export interface RadioOption<TValue extends string = string> {
  value: TValue;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<TValue extends string = string> {
  label: string;
  options: RadioOption<TValue>[];
  value?: TValue;
  defaultValue?: TValue;
  onValueChange?: (value: TValue) => void;
  disabled?: boolean;
  orientation?: "vertical" | "horizontal";
  name?: string;
  className?: string;
}

export function RadioGroup<TValue extends string = string>({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  orientation = "vertical",
  name,
  className,
}: RadioGroupProps<TValue>) {
  const baseId = useId();

  return (
    <RadixRadio.Root
      className={cx(styles.root, styles[orientation], className)}
      aria-label={label}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next as TValue)}
      disabled={disabled}
      orientation={orientation}
      name={name}
    >
      {options.map((option) => {
        const id = `${baseId}-${option.value}`;

        return (
          <div
            key={option.value}
            className={cx(styles.option, option.disabled && styles.disabled)}
          >
            <RadixRadio.Item
              id={id}
              value={option.value}
              disabled={option.disabled}
              className={styles.item}
            >
              <RadixRadio.Indicator className={styles.indicator} />
            </RadixRadio.Item>
            <div className={styles.text}>
              <label htmlFor={id} className={styles.label}>
                {option.label}
              </label>
              {option.description ? (
                <span className={styles.description}>{option.description}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </RadixRadio.Root>
  );
}

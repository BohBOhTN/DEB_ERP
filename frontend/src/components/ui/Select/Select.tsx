import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown, X } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { fr } from "../../../i18n/fr.js";
import { useFormField } from "../FormField/FormField.js";
import styles from "./Select.module.css";

export interface SelectOption<TValue extends string = string> {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
}

export interface SelectProps<TValue extends string = string> {
  options: SelectOption<TValue>[];
  value?: TValue | null;
  defaultValue?: TValue;
  onValueChange?: (value: TValue | null) => void;
  placeholder?: string;
  /// Adds a clear button that resets to no value.
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

function SelectInner<TValue extends string = string>(
  {
    options,
    value,
    defaultValue,
    onValueChange,
    placeholder = fr.select,
    clearable = false,
    disabled,
    invalid,
    name,
    id,
    className,
    ...rest
  }: SelectProps<TValue>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const field = useFormField();
  const isInvalid = invalid ?? field?.invalid ?? false;
  const controlled = value !== undefined;

  return (
    <div className={cx(styles.root, className)}>
      <RadixSelect.Root
        value={controlled ? (value ?? "") : undefined}
        defaultValue={defaultValue}
        onValueChange={(next) => onValueChange?.(next as TValue)}
        disabled={disabled}
        name={name}
      >
        <RadixSelect.Trigger
          ref={ref}
          id={id ?? field?.id}
          className={cx(styles.trigger, isInvalid && styles.invalid)}
          aria-invalid={isInvalid || undefined}
          aria-required={field?.required || undefined}
          aria-describedby={field?.describedBy}
          aria-label={rest["aria-label"]}
        >
          <span className={styles.value}>
            <RadixSelect.Value placeholder={placeholder} />
          </span>
          <RadixSelect.Icon className={styles.chevron}>
            <ChevronDown />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            className={styles.content}
            position="popper"
            sideOffset={4}
          >
            <RadixSelect.Viewport className={styles.viewport}>
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={styles.item}
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className={styles.indicator}>
                    <Check />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      {clearable && value ? (
        <button
          type="button"
          className={styles.clear}
          aria-label={fr.clear}
          disabled={disabled}
          onClick={() => onValueChange?.(null)}
        >
          <X />
        </button>
      ) : null}
    </div>
  );
}

export const Select = forwardRef(SelectInner) as <
  TValue extends string = string,
>(
  props: SelectProps<TValue> & { ref?: React.ForwardedRef<HTMLButtonElement> },
) => ReactNode;

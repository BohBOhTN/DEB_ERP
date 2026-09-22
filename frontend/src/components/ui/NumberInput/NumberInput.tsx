import {
  forwardRef,
  useEffect,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type ReactNode,
} from "react";
import Decimal from "decimal.js-light";
import { parseDecimalInput } from "../../../i18n/format.js";
import { TextInput, type TextInputProps } from "../TextInput/TextInput.js";

export interface NumberInputProps extends Omit<
  TextInputProps,
  "value" | "onChange" | "defaultValue" | "type" | "min" | "max" | "step"
> {
  /// Decimal string (`"12.5"`) or empty; never a float.
  value: string;
  onChange: (value: string) => void;
  decimals?: number;
  min?: string;
  max?: string;
  suffix?: ReactNode;
}

/// Right-aligned decimal input: accepts comma and dot while typing, emits a
/// normalised decimal string, and formats with a comma on blur (05 section
/// 3.1). Money and quantity inputs build on it.
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    {
      value,
      onChange,
      decimals = 3,
      min,
      max,
      onBlur,
      onFocus,
      invalid,
      ...rest
    },
    ref,
  ) {
    const [draft, setDraft] = useState(() => toDisplay(value, decimals));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
      if (!focused) {
        setDraft(toDisplay(value, decimals));
      }
    }, [value, decimals, focused]);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;

      if (!/^-?[\d\s  ]*[.,]?\d*$/.test(next)) {
        return;
      }

      setDraft(next);
      const parsed =
        next.trim() === "" ? "" : parseDecimalInput(next, decimals);

      if (parsed !== null) {
        onChange(parsed);
      }
    };

    const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
      setFocused(false);
      const parsed =
        draft.trim() === "" ? "" : parseDecimalInput(draft, decimals);
      const clamped =
        parsed === null || parsed === "" ? parsed : clamp(parsed, min, max);

      if (clamped !== null) {
        onChange(clamped);
        setDraft(toDisplay(clamped, decimals));
      } else {
        setDraft(toDisplay(value, decimals));
      }

      onBlur?.(event);
    };

    return (
      <TextInput
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        align="right"
        value={draft}
        invalid={invalid}
        onChange={handleChange}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={handleBlur}
        {...rest}
      />
    );
  },
);

function toDisplay(value: string, decimals: number): string {
  if (value === "" || value === undefined || value === null) {
    return "";
  }

  try {
    return new Decimal(value).toFixed(decimals).replace(".", ",");
  } catch {
    return "";
  }
}

function clamp(value: string, min?: string, max?: string): string {
  let result = new Decimal(value);

  if (min !== undefined && result.lessThan(min)) {
    result = new Decimal(min);
  }

  if (max !== undefined && result.greaterThan(max)) {
    result = new Decimal(max);
  }

  return result.toString();
}

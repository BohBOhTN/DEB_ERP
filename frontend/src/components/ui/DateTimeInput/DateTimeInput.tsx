import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "../TextInput/TextInput.js";

export interface DateTimeInputProps extends Omit<
  TextInputProps,
  "type" | "value" | "onChange" | "min" | "max"
> {
  /// `YYYY-MM-DDTHH:mm` (local wall time) or empty.
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}

export const DateTimeInput = forwardRef<HTMLInputElement, DateTimeInputProps>(
  function DateTimeInput({ value, onChange, ...rest }, ref) {
    return (
      <TextInput
        ref={ref}
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    );
  },
);

/// Converts the input's local wall time to the ISO instant the API expects.
export function localDateTimeToIso(value: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "../TextInput/TextInput.js";

export interface DateInputProps extends Omit<
  TextInputProps,
  "type" | "value" | "onChange" | "min" | "max"
> {
  /// `YYYY-MM-DD` or empty.
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}

/// Native date picker: the browser renders it in the device locale
/// (`jj/mm/aaaa` in French) and gives a proper picker on phones. The value
/// is always ISO (`YYYY-MM-DD`), which the API reads as a business day.
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput({ value, onChange, ...rest }, ref) {
    return (
      <TextInput
        ref={ref}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    );
  },
);

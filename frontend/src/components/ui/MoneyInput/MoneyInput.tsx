import { forwardRef } from "react";
import { fr } from "../../../i18n/fr.js";
import {
  NumberInput,
  type NumberInputProps,
} from "../NumberInput/NumberInput.js";

export interface MoneyInputProps extends Omit<
  NumberInputProps,
  "decimals" | "suffix"
> {
  currency?: string;
}

/// TND amount with three decimals; emits `"12.500"`-style strings, never a
/// float (05 section 3.1).
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput({ currency = fr.currency, min = "0", ...rest }, ref) {
    return (
      <NumberInput
        ref={ref}
        decimals={3}
        min={min}
        suffix={currency}
        {...rest}
      />
    );
  },
);

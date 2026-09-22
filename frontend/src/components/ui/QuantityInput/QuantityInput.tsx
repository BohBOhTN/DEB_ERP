import { forwardRef } from "react";
import {
  NumberInput,
  type NumberInputProps,
} from "../NumberInput/NumberInput.js";

export interface QuantityInputProps extends Omit<NumberInputProps, "suffix"> {
  /// Unit symbol shown as suffix: "kg", "pièce", "L".
  unit?: string | null;
}

export const QuantityInput = forwardRef<HTMLInputElement, QuantityInputProps>(
  function QuantityInput({ unit, decimals = 3, min = "0", ...rest }, ref) {
    return (
      <NumberInput
        ref={ref}
        decimals={decimals}
        min={min}
        suffix={unit ?? undefined}
        {...rest}
      />
    );
  },
);

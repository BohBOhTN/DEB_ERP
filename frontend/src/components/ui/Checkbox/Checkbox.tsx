import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { forwardRef, useId, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./Checkbox.module.css";

export interface CheckboxProps {
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
  disabled?: boolean;
  name?: string;
  value?: string;
  id?: string;
  className?: string;
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  function Checkbox({ label, description, id, className, ...rest }, ref) {
    const generatedId = useId();
    const checkboxId = id ?? generatedId;

    return (
      <div
        className={cx(styles.root, rest.disabled && styles.disabled, className)}
      >
        <RadixCheckbox.Root
          ref={ref}
          id={checkboxId}
          className={styles.box}
          {...rest}
        >
          <RadixCheckbox.Indicator className={styles.indicator}>
            {rest.checked === "indeterminate" ? <Minus /> : <Check />}
          </RadixCheckbox.Indicator>
        </RadixCheckbox.Root>
        <div className={styles.text}>
          <label htmlFor={checkboxId} className={styles.label}>
            {label}
          </label>
          {description ? (
            <span className={styles.description}>{description}</span>
          ) : null}
        </div>
      </div>
    );
  },
);

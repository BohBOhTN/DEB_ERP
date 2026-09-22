import * as RadixSwitch from "@radix-ui/react-switch";
import { forwardRef, useId, type ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./Switch.module.css";

export interface SwitchProps {
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch({ label, description, id, className, ...rest }, ref) {
    const generatedId = useId();
    const switchId = id ?? generatedId;

    return (
      <div
        className={cx(styles.root, rest.disabled && styles.disabled, className)}
      >
        <div className={styles.text}>
          <label htmlFor={switchId} className={styles.label}>
            {label}
          </label>
          {description ? (
            <span className={styles.description}>{description}</span>
          ) : null}
        </div>
        <RadixSwitch.Root
          ref={ref}
          id={switchId}
          className={styles.track}
          {...rest}
        >
          <RadixSwitch.Thumb className={styles.thumb} />
        </RadixSwitch.Root>
      </div>
    );
  },
);

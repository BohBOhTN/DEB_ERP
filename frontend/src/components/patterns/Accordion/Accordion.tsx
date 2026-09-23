import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./Accordion.module.css";

export interface AccordionItem {
  id: string;
  title: ReactNode;
  /// Right-aligned summary shown while collapsed and expanded (totals, badges).
  meta?: ReactNode;
  content: ReactNode;
  defaultOpen?: boolean;
}

export interface AccordionProps {
  label: string;
  items: AccordionItem[];
  className?: string;
}

/// Native disclosure groups (05 section 3.2): one `details` per item, so the
/// board stays keyboard and screen-reader accessible without script, and
/// several items may be open at once.
export function Accordion({ label, items, className }: AccordionProps) {
  return (
    <div className={cx(styles.root, className)} aria-label={label}>
      {items.map((item) => (
        <details key={item.id} className={styles.item} open={item.defaultOpen}>
          <summary className={styles.summary}>
            <span className={styles.title}>{item.title}</span>
            {item.meta ? (
              <span className={styles.meta}>{item.meta}</span>
            ) : null}
            <ChevronDown className={styles.chevron} aria-hidden="true" />
          </summary>
          <div className={styles.content}>{item.content}</div>
        </details>
      ))}
    </div>
  );
}

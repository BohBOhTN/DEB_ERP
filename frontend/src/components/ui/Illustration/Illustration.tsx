import { cx } from "../../../lib/cx.js";
import styles from "./Illustration.module.css";

export type IllustrationName = "shelf" | "ledger" | "basket" | "compass";

export interface IllustrationProps {
  name: IllustrationName;
  size?: number;
  className?: string;
}

/// Line-art illustrations in brand colours for empty states and the 404
/// page (UI-23): a bakery shelf, a ledger, a basket, a compass. Decorative
/// only, so hidden from assistive technology; the copy carries the meaning.
export function Illustration({
  name,
  size = 120,
  className,
}: IllustrationProps) {
  return (
    <svg
      className={cx(styles.root, className)}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {art[name]}
    </svg>
  );
}

const stroke = {
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const accent = {
  stroke: "var(--brand-gold)",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const art: Record<IllustrationName, React.ReactNode> = {
  shelf: (
    <>
      <rect x="14" y="22" width="92" height="80" rx="6" {...stroke} />
      <path d="M14 50h92M14 78h92" {...stroke} />
      <path
        d="M26 50V38a10 10 0 0 1 20 0v12M58 50V42a8 8 0 0 1 16 0v8"
        {...accent}
      />
      <path d="M30 78v-8a12 6 0 0 1 24 0v8M66 78l6-14 6 14" {...accent} />
      <circle cx="90" cy="66" r="6" {...accent} />
    </>
  ),
  ledger: (
    <>
      <rect x="24" y="14" width="72" height="92" rx="6" {...stroke} />
      <path d="M38 36h44M38 50h44M38 64h28" {...stroke} />
      <path d="M38 84h20" {...accent} />
      <path d="M70 80l6 6 12-14" {...accent} />
      <path d="M24 26h-6M24 46h-6M24 66h-6M24 86h-6" {...stroke} />
    </>
  ),
  basket: (
    <>
      <path d="M18 52h84l-8 46H26z" {...stroke} />
      <path d="M18 52l10-24M102 52l-10-24" {...stroke} />
      <path d="M40 52l6 46M80 52l-6 46M60 52v46" {...stroke} />
      <path d="M44 34a14 10 0 0 1 28 0" {...accent} />
      <path d="M74 36l14-10" {...accent} />
    </>
  ),
  compass: (
    <>
      <circle cx="60" cy="60" r="42" {...stroke} />
      <path d="M60 18v8M60 94v8M18 60h8M94 60h8" {...stroke} />
      <path d="M76 44 66 66 44 76l10-22z" {...accent} />
      <circle cx="60" cy="60" r="4" {...accent} />
    </>
  ),
};

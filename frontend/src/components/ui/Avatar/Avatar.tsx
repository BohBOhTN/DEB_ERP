import { cx } from "../../../lib/cx.js";
import styles from "./Avatar.module.css";

export interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  /// Navy by default; gold for the featured slot in the top bar menu.
  tone?: "navy" | "gold";
  className?: string;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";

  return `${first}${last}`.toUpperCase() || "?";
}

export function Avatar({
  name,
  size = "md",
  tone = "navy",
  className,
}: AvatarProps) {
  return (
    <span
      className={cx(styles.root, styles[size], styles[tone], className)}
      role="img"
      aria-label={name}
    >
      {initialsOf(name)}
    </span>
  );
}

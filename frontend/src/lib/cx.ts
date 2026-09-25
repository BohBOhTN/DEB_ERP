/// Joins class names, skipping falsy values: `cx(styles.root, active && styles.active)`.
export function cx(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}

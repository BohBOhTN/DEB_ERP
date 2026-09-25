/// Canonical form used for uniqueness and search on names: trimmed, accents
/// stripped, whitespace collapsed, lower-cased. "Thé à la menthe" and
/// "the a la menthe" normalise to the same string, so a cashier typing without
/// accents still finds the product.
export function normalizeName(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

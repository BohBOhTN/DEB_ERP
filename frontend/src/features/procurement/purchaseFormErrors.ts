/// The purchase form names its fields after what the user sees (a line's
/// `item` and `quantity`), the API after what it stores (`rawMaterialId`,
/// `enteredQuantity`). A refusal of the server is brought back to the
/// form's names so it shows on the field that caused it (issue 016).
const apiToForm: Array<[pattern: RegExp, formPath: string]> = [
  [/^supplierId$/, "supplier"],
  [/^lines\.(\d+)\.rawMaterialId$/, "lines.$1.item"],
  [/^lines\.(\d+)\.productId$/, "lines.$1.item"],
  [/^lines\.(\d+)\.enteredQuantity$/, "lines.$1.quantity"],
  [/^lines\.(\d+)\.enteredUnitId$/, "lines.$1.unitId"],
];

export function toFormFieldErrors(
  fieldErrors: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([path, message]) => {
      const rule = apiToForm.find(([pattern]) => pattern.test(path));

      return [rule ? path.replace(rule[0], rule[1]) : path, message];
    }),
  );
}

/// How many fields react-hook-form holds an error for, lines included.
export function countFieldErrors(errors: unknown): number {
  if (!errors || typeof errors !== "object") {
    return 0;
  }

  if (typeof (errors as { message?: unknown }).message === "string") {
    return 1;
  }

  return Object.entries(errors)
    .filter(([key]) => key !== "ref")
    .reduce((sum, [, value]) => sum + countFieldErrors(value), 0);
}

/// "Corrigez le champ signalé." / "Corrigez les 3 champs signalés."
export function errorSummary(count: number): {
  title: string;
  description: string;
} {
  return {
    title: "Le formulaire contient des erreurs.",
    description:
      count > 1
        ? `Corrigez les ${count} champs signalés.`
        : "Corrigez le champ signalé.",
  };
}

/// The shopping trip (issue 018) nests the purchase under `purchase.` and
/// calls the date `tripDate`; the form keeps the purchase editor's names.
const tripApiToForm: Array<[pattern: RegExp, formPath: string]> = [
  [/^supplierId$/, "supplier"],
  [/^tripDate$/, "purchaseDate"],
  [/^purchase\.dueDate$/, "dueDate"],
  [/^purchase\.paidAmountTnd$/, "paidAmountTnd"],
  [/^purchase\.lines\.(\d+)\.rawMaterialId$/, "lines.$1.item"],
  [/^purchase\.lines\.(\d+)\.productId$/, "lines.$1.item"],
  [/^purchase\.lines\.(\d+)\.enteredQuantity$/, "lines.$1.quantity"],
  [/^purchase\.lines\.(\d+)\.enteredUnitId$/, "lines.$1.unitId"],
  [/^purchase\.lines\.(\d+)\.unitPriceTnd$/, "lines.$1.unitPriceTnd"],
];

/// `rawMaterialCount` is how many raw-material lines the request carried
/// before its resold-product lines (issue 020): line N of the purchase is
/// line N of the first card, or line N − count of the second.
export function toTripFormFieldErrors(
  fieldErrors: Record<string, string>,
  rawMaterialCount = Number.POSITIVE_INFINITY,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([path, message]) => {
      const rule = tripApiToForm.find(([pattern]) => pattern.test(path));
      const mapped = rule ? path.replace(rule[0], rule[1]) : path;
      const line = /^lines\.(\d+)\.(.+)$/.exec(mapped);

      if (line && Number(line[1]) >= rawMaterialCount) {
        return [
          `productLines.${Number(line[1]) - rawMaterialCount}.${line[2]}`,
          message,
        ];
      }

      return [mapped, message];
    }),
  );
}

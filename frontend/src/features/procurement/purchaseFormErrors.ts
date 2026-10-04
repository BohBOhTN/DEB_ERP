/// The purchase form names its fields after what the user sees (a line's
/// `item` and `quantity`), the API after what it stores (`rawMaterialId`,
/// `enteredQuantity`). A refusal of the server is brought back to the
/// form's names so it shows on the field that caused it (issue 016).
const apiToForm: Array<[pattern: RegExp, formPath: string]> = [
  [/^supplierId$/, "supplier"],
  [/^lines\.(\d+)\.rawMaterialId$/, "lines.$1.item"],
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

import { describe, expect, it } from "vitest";
import {
  countFieldErrors,
  errorSummary,
  toFormFieldErrors,
} from "./purchaseFormErrors";

describe("purchase form errors", () => {
  it("brings the API's field names back to the form's", () => {
    expect(
      toFormFieldErrors({
        supplierId: "Un fournisseur actif est requis.",
        "lines.2.rawMaterialId": "Déjà sur une autre ligne.",
        "lines.0.enteredQuantity": "Quantité invalide.",
        "lines.1.unitPriceTnd": "Prix invalide.",
        dueDate: "Échéance invalide.",
      }),
    ).toEqual({
      supplier: "Un fournisseur actif est requis.",
      "lines.2.item": "Déjà sur une autre ligne.",
      "lines.0.quantity": "Quantité invalide.",
      "lines.1.unitPriceTnd": "Prix invalide.",
      dueDate: "Échéance invalide.",
    });
  });

  it("counts the fields in error, lines included", () => {
    expect(
      countFieldErrors({
        supplier: { type: "custom", message: "Choisissez un fournisseur." },
        lines: [
          { item: { message: "Choisissez une matière première." } },
          undefined,
          {
            quantity: { message: "Obligatoire." },
            unitPriceTnd: { message: "Obligatoire." },
          },
        ],
      }),
    ).toBe(4);
    expect(countFieldErrors({})).toBe(0);
    expect(countFieldErrors(undefined)).toBe(0);
  });

  it("words the summary for one field and for several", () => {
    expect(errorSummary(1).description).toBe("Corrigez le champ signalé.");
    expect(errorSummary(3)).toEqual({
      title: "Le formulaire contient des erreurs.",
      description: "Corrigez les 3 champs signalés.",
    });
  });
});

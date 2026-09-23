import { z } from "zod";
import { quantity, reason } from "../../lib/forms/schemas.js";

/// Both dialogs pick the item from a search box: no identifier is typed.
const pickedItem = z.object({
  itemType: z.enum(["PRODUCT", "RAW_MATERIAL"]),
  itemId: z.string().min(1, "Choisissez un article."),
  label: z.string(),
  unitSymbol: z.string(),
  currentQuantity: z.string(),
});
export type PickedItem = z.infer<typeof pickedItem>;

/// One form for both dialogs: the item is picked, the quantity is always
/// positive, and an adjustment adds a direction so no signed input exists
/// (07 section 4.2).
export function movementSchema(kind: "opening" | "adjustment") {
  return z
    .object({
      item: pickedItem.nullable(),
      direction: z.enum(["IN", "OUT"]).optional(),
      quantity: quantity({ positive: true }),
      reason: reason,
    })
    .superRefine((values, context) => {
      if (values.item === null) {
        context.addIssue({
          code: "custom",
          path: ["item"],
          message: "Choisissez un article.",
        });
      }

      if (kind === "adjustment" && !values.direction) {
        context.addIssue({
          code: "custom",
          path: ["direction"],
          message: "Choisissez le sens.",
        });
      }
    });
}

export type MovementFormInput = z.input<ReturnType<typeof movementSchema>>;
export type MovementFormOutput = z.output<ReturnType<typeof movementSchema>>;

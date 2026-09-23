import { z } from "zod";
import {
  isoDate,
  optionalString,
  requiredString,
  tnd,
} from "../../lib/forms/schemas.js";

/// Expense (EXP-005, EXP-006): category, date, positive amount, label;
/// reference and notes optional; posted at once when the switch is on.
export const expenseSchema = z.object({
  categoryId: z.string().min(1, "Choisissez une catégorie."),
  expenseDate: isoDate,
  amountTnd: tnd({ positive: true }),
  description: requiredString(2, 200),
  externalReference: optionalString(80),
  notes: optionalString(500),
  post: z.boolean().default(false),
});
export type ExpenseFormInput = z.input<typeof expenseSchema>;
export type ExpenseFormOutput = z.output<typeof expenseSchema>;

export const expenseCategorySchema = z.object({
  name: requiredString(2, 80),
  description: optionalString(200),
});
export type ExpenseCategoryFormInput = z.input<typeof expenseCategorySchema>;
export type ExpenseCategoryFormOutput = z.output<typeof expenseCategorySchema>;

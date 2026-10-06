# 018 · Course fournisseur: ingredients and other goods in one screen, and sub-categories of expenses

| Field            | Value                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module           | `backend/src/modules/procurement`, `backend/src/modules/expenses`, `frontend/src/features/procurement`, `frontend/src/features/expenses`, `frontend/src/features/home` |
| Type             | Feature                                                                                                                                                                |
| Priority         | High                                                                                                                                                                   |
| Depends on       | 016 (purchase validation on the fields, one line per material)                                                                                                         |
| Suggested branch | `feat/018-course-fournisseur`                                                                                                                                          |
| Related          | source of truth §10 (`SUP-004` to `SUP-012`), §15 (`EXP-001` to `EXP-008`), rule 04 (stock, payable and expense are separate effects), spec 07 §4.3 and §4.8           |

## Owner's request

> We go to store A and buy ingredients, but also goods that are not ingredients and that the business needs: plastic bags, napkins, and so on. Today that is two modules. I want one clean screen where I record both and validate them together, reachable from the quick actions. And sub-categories for the expenses.

## Findings

### Two documents, two screens, two validations

- An ingredient purchase is a `Purchase`: supplier, lines of raw materials with units and prices, payment terms, posting that moves stock and the supplier's payable ([procurement.service.ts](../backend/src/modules/procurement/procurement.service.ts)). A plastic bag is an `Expense`: category, amount, label, posting that records money out and nothing else ([expenses.service.ts](../backend/src/modules/expenses/expenses.service.ts)). The source of truth keeps them apart on purpose: stock and payable are effects of a purchase, an expense has neither. The screen can be one; the documents stay two.
- Nothing links an expense to the trip it came from: `Expense` has no supplier and no purchase ([schema.prisma:1261](../backend/prisma/schema.prisma#L1261)), so "what did we spend at store A on Monday" cannot be answered.
- `createExpense` runs its own transaction and `postPurchase` its own; a screen that validates both at once must do it in one, or a failure after the purchase would leave the expenses behind.
- The quick actions of `Accueil` offer `Nouvel achat` and `Nouvelle dépense` separately ([QuickActionsCard.tsx](../frontend/src/features/home/widgets/QuickActionsCard.tsx)).

### Categories are flat

- `ExpenseCategory` has a name and a description, nothing above it ([schema.prisma:1240](../backend/prisma/schema.prisma#L1240)); the list, the form and the expense picker know one level ([ExpenseCategoriesPage.tsx](../frontend/src/features/expenses/pages/ExpenseCategoriesPage.tsx), [ExpenseFormDialog.tsx](../frontend/src/features/expenses/components/ExpenseFormDialog.tsx)).
- Names are unique among active categories (`assertCategoryNameAvailable`); that stays, a sub-category is a category with a parent, not a namespace.

## Proposed change

### Backend

1. **Sub-categories.** `expense_categories.parent_id` (nullable, self-referencing, `ON DELETE RESTRICT`). Create and update take `parentId`; the parent must be active and may not be the category itself or one of its descendants; a category with active children cannot be deactivated. The list answers `parentId`, `depth` and `path` ("Fournitures › Emballage"), ordered as a tree. Any active category, parent or leaf, can carry an expense.
2. **The trip.** `expenses.purchase_id` and `expenses.supplier_id`, both nullable. `POST /procurement/shopping-trips` (`purchases.create`, `purchases.post` and `expenses.create`, idempotent) takes the supplier, the date, the ticket reference, the notes, the payment terms, the raw-material lines and the expense lines (category, label, amount). In one transaction: the purchase is created and posted (stock, payable, payment at posting, as `postPurchase` does today), then each expense is created posted, dated the same day, linked to the supplier and the purchase. A trip with no raw-material line records the expenses only; one with no expense line is a plain purchase. The same input rules as issue 016 apply to the lines; an expense line needs an active category, a label and a positive amount; at least one line of either kind.
3. **Reading it back.** `GET /expenses` filters by `purchaseId`; expense rows carry `supplier` and `purchase` (reference); `GET /procurement/purchases/{id}` carries its linked expenses (count and total), so the purchase page can show "Autres achats de cette course".

### Frontend: `/achats/course`, "Nouvelle course"

One page, built from the existing kit, phone first.

- **Header**: eyebrow `Achats`, title `Nouvelle course`, description "Ce que vous avez acheté chez un fournisseur : les matières premières et le reste, validés ensemble."
- **Card `Magasin`**: supplier `Combobox` (required), date (`DateInput`, today, not in the future), ticket reference, notes.
- **Card `Matières premières`**: the `PurchaseLineEditor` of issue 016 (picker without repeats, base-unit hints), subtotal under it. The card says what these lines do: "Entrent en stock et dans le compte du fournisseur."
- **Card `Autres achats`**: an `ExpenseLineEditor`, one row per line: category (`Select` with the path labels, nested), label (`TextInput`, "Sachets plastiques"), amount (`MoneyInput`), remove; `Ajouter une dépense`; subtotal. The card says: "Comptés en dépenses, ne touchent ni le stock ni le compte du fournisseur."
- **Side card `Totaux`**: `Matières premières`, `Autres achats`, `Total de la course` in large; then the payment of the raw materials (`Payé | Partiel | Impayé`, amount, due date, the `PurchaseTotalsCard` as is) with one line of explanation: "Les autres achats sont réglés sur place." A line `Sortie de caisse aujourd'hui` sums what leaves today (paid part plus other goods).
- **One button, `Valider la course`**, into a `ConfirmPostingDialog` whose impact lists: stock per material, the supplier's payable, the payment recorded, "N dépenses pour X TND", and that nothing can be edited afterwards, only cancelled. Success: a toast and the purchase page (or the expenses list when the trip had no raw material).
- **Errors**: the field rules of issue 016 on both editors, a summary styled as an error, server `fieldErrors` mapped to the lines (`expenses.0.amountTnd`).
- **Reaching it**: `Course fournisseur` in the quick actions of `Accueil` (shown with the three permissions), `Nouvelle course` next to `Nouvel achat` on `Achats`, and on `Dépenses`.
- **After**: the purchase page gains a card `Autres achats de cette course` (the linked expenses, with their total); an expense row shows its supplier and a link to the purchase; the expenses list filters by a purchase from that link.
- **Categories**: the categories page shows the tree (children indented under their parent, the path in the phone card); the category form gains `Catégorie parente` (optional); every category `Select` shows the path.

## Tests

- Backend: parent rules (active parent, no self, no cycle, no deactivation with active children), tree order and paths; the trip on doubles (purchase posted and expenses posted in one transaction, links set, expenses-only and purchase-only trips, a failing expense rolls back the purchase, replay on the same key, field errors on expense lines), the route guards (403 without any of the three permissions, 400 without an idempotency key), the expenses filter by purchase.
- Frontend: the categories page tree and the parent picker; the trip page on a phone and on desktop (fill both editors, totals, validate, the dialog's impact, the toast, the links on the purchase page), a trip of expenses only, the refusal of an empty trip, the summary on errors, the quick action; the expense list showing the supplier.
- Browser: the trip flow at the three widths, axe on the new page.

## Acceptance criteria

- From `Accueil`, `Course fournisseur` opens one page where the owner records 10 kg of flour and a pack of plastic bags bought at the same store, sees the three totals and validates once; the stock, the supplier's account and the expenses are all updated, and the plastic bags appear in `Dépenses` with the store's name and a link to the purchase.
- A category can be created under another one; the expense form offers "Fournitures › Emballage"; the categories page shows the tree.
- A trip with no raw material records the expenses alone; a trip with nothing is refused before any request.

## Decisions surfaced

- `DEC-V2-009` (new): a shopping trip is one screen and one validation over two documents that stay what they are; expenses of a trip are always paid on the spot; any active category can carry an expense.
- Left for a later step: a draft trip, a quantity and unit price on an expense line, the same screen for a distributor.

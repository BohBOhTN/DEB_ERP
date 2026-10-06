# Feature 018: Course fournisseur, one page for a purchase and its expenses, and sub-categories of expenses

## Branches

- Source: `feat/018-course-fournisseur` (from `main`)
- Target: `staging` first (to try on the test environment), then `main`

## Scope

Closes issue 018 ([issues/018](../issues/018-course-fournisseur-et-sous-categories.md)):
the owner buys ingredients and consumables (plastic bags, napkins) at the
same store and wants to record the ticket once, with the consumables filed
under finer categories. Decision `DEC-V2-009` in the local decision log:
a shopping trip is one screen and one validation over two documents that
stay what they are; the expenses of a trip are always paid on the spot;
any active category, parent or leaf, can carry an expense.

## Summary

- **Schema** (one additive migration,
  `20261006100000_expense_sub_categories_and_shopping_trips`):
  `expense_categories.parent_id` (self-referencing, restrict) and
  `expenses.supplier_id`, `expenses.purchase_id` (nullable, restrict).
  Nothing is backfilled: existing categories stay at the top level and
  existing expenses keep no store and no purchase.
- **Sub-categories** (`ExpensesService`). Create and update take
  `parentId`: the parent must be active and neither the category itself
  nor one of its descendants (`EXPENSE_CATEGORY_PARENT_INVALID`,
  `ACTIVE_PARENT_CATEGORY_REQUIRED`); a parent is deactivated only once
  its sub-categories are (`EXPENSE_CATEGORY_HAS_ACTIVE_CHILDREN`); a
  category comes back only under an active parent. The list reads as a
  tree (parent, then its children, siblings by name, inactive last) with
  `depth` and `path` ("Fournitures › Emballage"). Name uniqueness stays
  global among active categories.
- **The trip** (`POST /procurement/shopping-trips`, permissions
  `purchases.create`, `purchases.post` and `expenses.create`, idempotent).
  In one transaction: the raw-material lines become a purchase created and
  posted exactly as `postPurchase` does (stock receipt, payable, payment at
  posting, audit), then each expense line becomes an expense posted on the
  spot, dated the trip's day, linked to the store and the purchase, with
  the ticket reference as its external reference. A trip may hold expenses
  alone or a purchase alone; one with nothing is refused
  (`SHOPPING_TRIP_EMPTY`). Every mistake of the form is answered at once
  on its field (`tripDate`, `purchase.lines.N.*`, `expenses.N.*`), the way
  issue 016 does for a purchase. One audit row `shopping_trip.post` ties
  the documents together. `createPurchase`, `postPurchase` and
  `getPurchase` were split into transaction-capable helpers
  (`createPurchaseWith`, `postPurchaseWith`, `getPurchaseWith`); the
  purchase-alone paths call them unchanged.
- **Reading it back.** `GET /expenses` filters by `purchaseId` and
  `supplierId`; every expense row carries `supplier` and `purchase`
  (reference); the purchase detail carries `expenses` (each with its
  state and category) and `expensesTotalTnd` over the posted ones.
- **`/achats/course`, "Nouvelle course".** One page, phone first: a
  `Magasin` card (supplier, date, ticket reference, notes), the
  `PurchaseLineEditor` of issue 016 for the raw materials with its
  subtotal, a new `ExpenseLineEditor` (category with its path, label,
  amount, remove, `Ajouter une dépense`) with its subtotal, and a side
  column with the three totals, the payment of the raw materials
  (`PurchaseTotalsCard`, shown only when there are lines, with "Les
  autres achats sont réglés sur place") and `Sortie de caisse
aujourd'hui`. One button, `Valider la course`, into a
  `ConfirmPostingDialog` stating stock per material, the supplier's debt,
  the payment recorded, the expenses and what leaves the till today.
  Success goes to the purchase page, or to `Dépenses` when nothing
  entered stock. The field rules of issue 016 apply to both editors before
  any request; a refusal of the server lands on the line it concerns.
- **Reaching it.** `Course fournisseur` in the quick actions of `Accueil`
  (shown with the three permissions), `Nouvelle course` next to `Nouvel
achat` on `Achats`, `Course fournisseur` on `Dépenses`, and the command
  palette.
- **After.** The purchase page gains `Autres achats de cette course`
  with the total and a link to the expense list filtered on that trip;
  an expense row names its store and links its purchase; the categories
  page shows the tree (indented rows, the path in the phone card); the
  category form gains `Catégorie parente` (never itself nor its
  descendants); every category picker prints the path.
- **Cache.** A new `procurement.shoppingTrip` event refreshes purchases,
  stock, the raw-material details, expenses, the home summary and the
  analyses.

## Out of Scope

- A draft trip, a quantity and unit price on an expense line, the same
  screen for a distributor (left for a later step, as the brief says).
- A per-parent uniqueness of category names; an expense filter by
  supplier in the UI (the API takes it).
- Cancelling a purchase does not cancel the expenses of its trip; each
  document is cancelled on its own page, with its own reason.

## Verification

Run locally on macOS, Node 24, on 2026-10-06:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings (stylelint included)
- `npm run typecheck`: passed, backend and frontend (contract, API types
  and permission keys regenerated; `openapi:check` up to date)
- `npm run test --workspace backend`: 456 passed, 16 skipped (61 files,
  the six database-backed suites skipped here). New: the category tree
  (active parent, self, descendant, deactivation with active children,
  reactivation under an inactive parent, tree order and paths, a parent
  absent from the rows); the trip on a transactional double (purchase and
  expenses posted together and linked, expenses-only and purchase-only
  trips, rollback when a category is inactive or the stock location is
  missing, an inactive store, replay on the same key, conflict on a
  reused key, every field error at once); the routes (403 without each of
  the three permissions, 400 without an idempotency key, the body passed
  through, the empty default); the expenses list filter; the
  authorization matrix and the OpenAPI coverage with the new route
- `npm run test --workspace frontend`: 301 passed (100 files). New: the
  trip page (flour and bags validated together with the totals, the
  impact, the toast and the purchase page's card; expenses alone on a
  phone; an empty trip and an empty line refused before any request; a
  refusal of the server on the lines it concerns; the three permissions),
  the category tree and the parent picker (neither itself nor its
  descendants), a parent kept active while a sub-category is, the store
  and the purchase link on an expense row and the trip filter, the quick
  action with and without the three permissions, the invalidation map,
  the French copy of the new error codes
- `npm run build`: passed; 201.7 kB gzip initial against 250 kB (the trip
  page is its own 4.7 kB chunk); POS route 14.3 kB against 120 kB
- Playwright on the system Brave browser (`E2E_BROWSER`), mocked API,
  360, 768 and 1280 px: `e2e/shoppingTrip.spec.ts` (the trip from the
  quick action to the purchase page, both editors fitting their card, the
  totals, the impact, axe on the confirmation; an empty trip refused
  before any request), axe on `/achats/course`, and the procurement,
  expenses and shell specs again: 6 + 3 + 10 passed, 2 skipped by design.
  Two phone runs timed out while the unit suite ran beside them and
  passed on their own
- Not run here (no local PostgreSQL): the database-backed suites and the
  migration against a real database. Both run in CI; the first run of
  this branch is the evidence to read

## Database and Migration Impact

One additive migration: three nullable columns, three indexes, three
foreign keys. No data change. Safe to apply before the code is deployed
and to leave in place if the code is rolled back.

## Environment Impact

None: no new setting, no new dependency.

## Risks and Follow-Up

- The trip holds a row lock on the purchase and writes a dozen rows in one
  transaction, like a purchase posting followed by expense postings; the
  `postingTransactionOptions` budget (15 s) is the same.
- A trip's expenses are posted at once and cannot be edited, only
  cancelled, which is what the brief asked; a wrong amount is a
  cancellation and a new expense.
- `Dépenses` filtered on a trip reads `purchaseId` from the address; the
  chip names the purchase from the rows it finds, so an empty page shows
  the chip without a reference.
- UX checklist screenshots: waived (owner's decision, automated checks
  replace screenshots): overflow assertions on both editors at the three
  widths, axe on the page and the confirmation, keyboard flow through the
  kit's own components.

## Merge Checklist

- [ ] CI passed, including the database-backed suites
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 018
- [ ] Target branch is `staging`, then `main`

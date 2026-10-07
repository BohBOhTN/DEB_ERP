# Feature 020: Nouvelle course, a card for the resold products

## Branches

- Source: `feat/020-course-produits-de-revente` (from `feat/019-produits-de-revente`)
- Target: `dev`, after pull request 019

## Scope

Closes issue 020 ([issues/020](../issues/020-course-fournisseur-produits-de-revente.md)):
on `Nouvelle course`, a section for the products bought to be resold,
right after the raw materials. Decisions `DEC-V2-009` and `DEC-V2-010`
cover it; none is new. Second of four stacked branches.

## Summary

- **API.** The lines of a trip's purchase take `rawMaterialId` or
  `productId`, like a purchase. Nothing else changes on the server: the
  raw materials and the resold products of a trip are one purchase, the
  other goods are its expenses, all in one transaction (issue 018).
- **Page.** Three cards in the order of a ticket: `Matières premières`
  (picker of raw materials), `Produits de revente` (picker of resold
  products, empty at first, shown to a user who holds `products.view`),
  `Autres achats`. Each has its subtotal. One line anywhere is enough.
- **Totals.** `Matières premières`, `Produits de revente`, `Autres
achats`, `Total de la course`. The payment card is now `Paiement des
marchandises` and covers the first two; it shows as soon as either has
  a line.
- **Confirmation.** The stock received lists both kinds.
- **Errors.** The field rules apply to each card; a refusal of the server
  on line N of the purchase lands in the card that holds that line.
- **Labels.** Each editor sits in a group named after its card, since
  their fields share names ("Quantité 1").
- The message of an empty trip names the three kinds of line.

## Out of Scope

- A separate purchase, or separate payment terms, for the resold products
  of a trip.
- The analyses (021) and the KPIs (022).

## Verification

Run locally on macOS, Node 24, on 2026-10-06:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend (contract and API
  types regenerated)
- `npm run test --workspace backend`: 478 passed, 16 skipped (63 files, the six database-backed suites skipped here). New: a trip posting
  one purchase of flour and bottles with its expense, both stocks and the
  cost; a product made here refused with nothing written; a line without
  an item or a repeated product answered under `purchase.lines`; the
  route passing a product line
- `npm run test --workspace frontend`: 309 passed (100 files). New: the three
  cards in order; flour, bottles and bags validated together with the
  totals and the impact; a trip of resold products alone; a refusal on a
  product line shown in its own card; the card hidden without
  `products.view`
- `npm run build`: passed; 201.9 kB gzip initial against 250 kB; POS route 14.3 kB against 120 kB
- Playwright on the system Brave browser, mocked API, 360, 768 and
  1280 px: the trip with its three cards from the quick action to the purchase page (both line editors fitting their card, the totals, the impact, axe on the confirmation), the empty trip, the purchase specs and axe on the purchase pages: 21 passed
- Not run here (no local PostgreSQL): the database-backed suites. They
  run in CI

## Database and Migration Impact

None beyond issue 019.

## Environment Impact

None.

## Risks and Follow-Up

- The resold products of a trip share the payment terms of its raw
  materials because they are one purchase.
- Stacked on 019: merge that pull request first.
- UX checklist screenshots: waived (owner's decision): both line editors'
  fit is asserted at the three widths, axe runs on the page.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 020
- [ ] Pull request 019 merged first; target branch is `dev`

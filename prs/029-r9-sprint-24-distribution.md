# R9 Sprint 24: Distribution

## Branches

- Source: `feature/r9-sprint-24-distribution`
- Target: `dev`

## Scope

Release R9 (module redesign wave 2), Sprint 24. Closes `UI-16`: the
distributor directory and detail, the custody board, the dispatch editor,
the settlement workspace whose line quantities must reconcile before
submission, the direct sale and the distributor payments with allocations,
rebuilt on the kit following the seven-step recipe. The two V1
distribution files are deleted, and with them the last POS shim. One
additive backend change gives the lists the balance, custody and last
payment figures the spec names. One pattern (`Accordion`) and one kit
option (`LineEditor.showPrice`) are added through the component kit.

## Summary

- Screens rebuilt (07 section 4.7): `Distributeurs` (`/distributeurs`),
  `Distributeur` detail (`/distributeurs/:id`, tabs Dépôt-vente, Ventes
  directes, Règlements, Relevé, Paiements), `Dépôt-vente`
  (`/distribution/depot-vente`, tabs En dépôt, Sorties, Règlements),
  `Nouvelle sortie` (`/distribution/sorties/nouvelle`), `Sortie` detail
  (`/distribution/sorties/:id`, the launch point of the settlement),
  `Régler la sortie` (`/distribution/sorties/:id/regler`), `Règlements
distributeurs` (`/distribution/reglements`).
- Components added: `features/distribution/{distribution.api,distribution.queries,distribution.schemas}.ts`,
  `pages/*` (seven pages), `components/DistributorCombobox`,
  `DistributorFormDialog`, `CustodyBoard` (on the new `Accordion`: per
  distributor the held total and the discrepancy badge, per line the five
  quantities of the custody equation), `SettlementLineEditor` (four
  quantity inputs per line, the equation stated under them, the live
  remainder, the row in error until it holds, the unit price defaulted from
  the product and editable, the line revenue), `SettlementTotalsCard`
  (montant vendu, payé maintenant, reste dû on `TotalsCard` + `PaymentBox`),
  `DirectSaleDialog` (form then `ConfirmPostingDialog`; lines with prices on
  the shared line editor, payment now, receivable for the rest),
  `DistributorPaymentDialog` (kit `AllocationTable` over open direct sales
  and settlements from the statement), `DistributorStatement`,
  `distributionLabels`; `components/patterns/Accordion` (native
  disclosures, kit example and unit test); `LineEditor.showPrice` to hide
  the price columns of quantity-only documents.
- Impact texts (release file): dispatch (stock down, custody up, no sale nor
  debt), settlement (custody down, stock back for returns, revenue for the
  sold quantity, receivable or payment, the unaccounted quantity flagged
  without debt), payment (receivable down, custody untouched).
- API endpoints consumed (all under `/api/v1/distribution`): `GET/POST/PATCH
/distributors`, `GET .../{id}`, `GET .../{id}/statement` (cursor); `POST
/distributor-sales`; `GET/POST /distributor-dispatches`, `GET .../{id}`;
  `GET/POST /distributor-settlements`; `GET /distributor-custody`; `GET
/distributor-balances`; `GET/POST /distributor-payments`; plus `GET
/pos/products?q` for the product pickers and the default prices.
- V1 files deleted: `features/distribution/DistributionManagement.tsx`,
  `features/distribution/distributionApi.ts`, and the `posApi.ts` shim of
  Sprint 23 whose only consumer was the V1 distribution screen.
  `catalogApi.ts` remains for the simulation screen until Sprint 26.
- Backend (additive, no migration): distributor rows carry `balanceTnd`
  (one ledger `groupBy` per page) and `heldLineCount` (one scan of the open
  dispatches per page); balance rows carry `lastPaymentAt` (one payment
  `groupBy` per page).

### Deliverables by requirement

| ID    | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-16 | Distributor list with phone, lines held, `Solde dû` in danger tone and status, creation and edition dialog with `version`; detail with the two big numbers and five tabs; custody board grouped by distributor with header totals and the discrepancy badge; dispatch table with `Ouverte`/`Réglée`; full-page dispatch editor with the impact confirmation; settlement page with four quantities per line that must add up to what is held, live remainder, row error and a disabled submit until every line reconciles, price per unit sold defaulted from the product, `TotalsCard` with paid now and remaining, impact confirmation listing stock return, custody decrease, revenue, receivable or payment and the unaccounted quantity without debt; direct sale dialog with prices and `PaymentBox`; balances table with the last payment and the payments table with a `Nouveau paiement` dialog allocating to settlements and direct sales |

## Out of Scope

- Discrepancy resolution reasons, alerts or approvals (`DST-024`,
  deferred): the unaccounted quantity stays visible on the board and the
  dispatch until a later sprint decides its follow-up.
- Distributor price lists (`DST-029`, `OD-006` open): the price is entered
  or confirmed on each transaction and snapshotted, as the default says.
- A period filter on the settlements tab: the API supports it; the tabs
  paginate by date order.

## Verification

Run locally on macOS, Node 24.15.0:

- `npm run format:check`: passed
- `npm run lint` (ESLint with hooks and a11y rules, stylelint): passed,
  zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 307 passed, 10 skipped; the V1
  distribution route and service tests remain green with the added counts
- `npm run test --workspace frontend`: 170 passed (77 files), including
  `DistributionPages.test.tsx` (AS-014 dispatch with the impact and no sale;
  AS-015 and AS-V2-20 settlement at 768 px blocked at "Reste 40", "Reste 2"
  and "Dépassement de 1" until 30 + 8 + 2 reconcile, then posted with the
  return, the revenue, the receivable and the unaccounted quantity stated
  without debt; the custody board with the discrepancy badge at 360 px;
  AS-016 payment allocated to the settlement reducing the balance from
  36,000 to 16,000; the directory without identifiers) and
  `Accordion.test.tsx`
- `npm run build`: passed; initial JavaScript 195.8 kB gzip against the
  250 kB budget; POS chunk 11.2 kB against 120 kB
- `npm run openapi:check` and `npm run api:types`: in sync (response shapes
  are not described by the schemas, so the document is unchanged)
- `npm run e2e --workspace frontend` (Playwright on the system Brave
  browser): 15 passed, 1 skipped by design, at 360 and 1280 px: the shell
  smoke (`Distributeurs` now checked by heading, the login round-trip moved
  to `/depenses`), the five module flows and the distribution flow below
- `npm run screen:review --workspace frontend`: login, home, the twenty
  rebuilt routes and one V1 route at 360, 430, 768 and 1280 px, no
  horizontal overflow

Acceptance scenarios:

| ID       | Where                                                                                                                                                                                                                                                                                              | Result |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AS-014   | `DistributionPages.test.tsx` and `e2e/distribution.spec.ts`: dispatching 100 (unit test) or 40 (browser) breads creates an open dispatch with the quantity held and no sale; the confirmation states "Aucune vente ni dette"                                                                       | pass   |
| AS-015   | Same tests: 30 sold, 8 returned, 2 unaccounted recognise 36,000 as revenue, return 8 to stock, close the dispatch with the 2 flagged and no debt for them                                                                                                                                          | pass   |
| AS-016   | Same tests: a 20,000 payment reduces the receivable from 36,000 to 16,000; custody and the unaccounted quantity are unchanged                                                                                                                                                                      | pass   |
| AS-V2-20 | `DistributionPages.test.tsx` at 768 px and `e2e/distribution.spec.ts` at 360 and 1280 px: submission blocked until the line reconciles; after posting the board shows 0 held, the return of 8 is stated, the receivable equals 30 × 1,200 and the discrepancy of 2 is visible without a debt entry | pass   |

## UX acceptance checklist

Executed for the seven screens against `09_UX_ACCEPTANCE_CHECKLIST.md`.
Owner decision: no screenshot images; the automated checks are the
evidence.

| Section                        | Result                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Layout and responsiveness    | pass: `screen:review` at four widths on the four list and editor routes; card mode below 600 px on every list; the settlement's four inputs stack two by two on phones; the custody table scrolls inside its accordion                    |
| B Brand and visual consistency | pass: tokens only, `PageHeader` + `FilterBar` + `DataTable` on lists, `Tabs`, `StatusPill` (`Ouverte`/`Réglée` on the custody vocabulary), `TotalsCard`, `PaymentBox`, `AllocationTable`, `StatementTable`, `ConfirmPostingDialog` reused |
| C Copy and localisation        | pass: French with accents; ledger entry types and states through `distributionLabels.ts`; no enum, id or key as primary content (asserted on the directory and the board)                                                                 |
| D Screen states                | pass: skeleton, background refresh, empty with the next action, field and server errors, denied through the route guard, error with retry, success toast after the server, pending posting non-closable                                   |
| E Business safety              | pass: dispatch, settlement, direct sale and payment through `ConfirmPostingDialog` with an impact block and one key per intent; the settlement equation enforced before submission and by the server; no debt from unaccounted quantities |
| F Accessibility                | pass: named quantity inputs per product, the line as a named group with a live equation, native disclosures on the board, focus trap in dialogs; `axe` still planned for Sprint 27                                                        |
| G Performance                  | pass: server pagination on every list; balances, held lines and last payments batched per page on the server; the board reads one custody payload bounded to open dispatches                                                              |

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- The settlement page reads one page of products for the default prices; a
  catalogue larger than that page leaves later products' prices to be typed.
- `catalogApi.ts` survives until Sprint 26 deletes the simulation V1 screen.
- No `v1.4.0` tag by owner decision (releases stay untagged).

## Merge Checklist

- [ ] CI passed
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] Screen spec delivered in full (07 section 4.7)
- [x] `12_SPRINT_STATUS_V2.md` and `CHANGELOG.md` updated
- [x] Target branch is `dev`

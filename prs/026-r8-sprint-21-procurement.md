# R8 Sprint 21: Procurement

## Branches

- Source: `feature/r8-sprint-21-procurement`
- Target: `dev`

## Scope

Release R8 (module redesign wave 1), Sprint 21. Closes `UI-12`: suppliers,
purchases, the purchase editor and supplier payments rebuilt on the kit,
following the seven-step recipe of the release file. The two V1 procurement
files are deleted. Two additive backend changes give the screens what the
spec names: a draft purchase can be replaced before posting (the spec's
`Modifier` action had no endpoint), and purchase rows carry their ledger
balance and payment state.

## Summary

- Screens rebuilt (07 section 4.3): `Fournisseurs` (`/fournisseurs`),
  `Fournisseur` detail (`/fournisseurs/:id`, tabs Achats, Relevé,
  Paiements), `Achats` (`/achats`), `Nouvel achat` (`/achats/nouveau`, full
  page), `Modifier le brouillon` (`/achats/:id/modifier`), `Achat` detail
  (`/achats/:id`), `Paiements fournisseurs` (`/paiements-fournisseurs`).
- Components added: `features/procurement/{procurement.api,procurement.queries,procurement.schemas}.ts`,
  `pages/*` (six pages), `components/SupplierCombobox` (search over the
  balances endpoint, each option shows what is owed), `SupplierFormDialog`,
  `PurchaseLineEditor` (wraps `LineEditor`: raw material search by name,
  unit options from the material's active conversions, hint "= 200 kg ·
  prix par kg", line total as the backend computes it),
  `PurchaseTotalsCard` (wraps `TotalsCard`: Payé/Partiel/Impayé control,
  paid amount for a partial purchase, due date required while a balance
  remains, remaining due live), `PostPurchaseDialog` (on
  `ConfirmPostingDialog`: stock per material in base units, payable, payment
  recorded), `SupplierPaymentDialog` (on `FormDialog` + `PaymentBox`) with
  `AllocationTable` (one money input per open purchase, remaining due,
  overdue badge, unallocated remainder live, sum ≤ amount), `SupplierStatement`
  (on `StatementTable`: date range, opening and closing balance, running
  balance, server-stated basis, "Charger plus" by cursor).
- Kit extensions: `LineEditor` gains `lineHint` and `lineTotalFor`;
  `ItemCombobox` hands back the picked record with the item.
- API endpoints consumed (all under `/api/v1/procurement`): `GET
/supplier-balances`; `GET/POST/PATCH /suppliers`, `GET /suppliers/{id}`,
  `GET /suppliers/{id}/statement` (cursor); `GET/POST /purchases`, `GET
/purchases/{id}`, `PATCH /purchases/{id}` (new), `POST
/purchases/{id}/post`, `POST /purchases/{id}/cancel`; `GET/POST
/supplier-payments`; plus `GET /catalog/raw-materials` and
  `/catalog/raw-materials/{id}` for the line editor.
- V1 files deleted: `features/procurement/ProcurementManagement.tsx`,
  `features/procurement/procurementApi.ts`. The legacy route entries for
  the three paths are removed; the `catalogApi.ts` shim now serves the
  simulation screen only.
- Backend (additive, no migration): `PATCH /procurement/purchases/{id}`
  replaces a draft's header and lines in one transaction (`purchases.create`,
  `409 PURCHASE_NOT_DRAFT` otherwise, audit action `purchase.update`); the
  purchase list carries `balanceTnd` and `paymentState` from one ledger
  aggregate per page; supplier balance rows carry the `reference` and
  `totalTnd` of each open purchase. The OpenAPI document and the generated
  types are regenerated.

### Deliverables by requirement

| ID    | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-12 | Supplier list with phone, `Solde dû` in warning tone above zero, open purchases with the overdue count, status, search and name or balance sort, creation and edition dialog with `version`; supplier detail with the balance as a big number, `Payer`, and the Achats, Relevé, Paiements tabs; purchase list with Référence, Date, Fournisseur, Total, Payé, Reste, Échéance with `En retard`, Statut, filters (supplier, status, terms, period, `En retard` toggle) and sort in the URL; full-page editor with supplier picker, date, supplier reference, notes, converted-unit lines, sticky totals with terms, paid amount and due date rules, `Enregistrer le brouillon` and `Valider l'achat`; posting through `ConfirmPostingDialog` with the stock, payable and payment impact; detail with lines, payments, totals, `Valider`, `Modifier`, `Annuler` with a mandatory reason and the reversal impact; supplier payments list and the `Nouveau paiement` dialog with allocations |

## Out of Scope

- The statement's purchases and payments sub-lists beyond the ledger
  entries: the Relevé tab shows the ledger with running balance; the
  documents are the Achats and Paiements tabs.
- A CSV export of statements: no endpoint.
- The generalised `components/patterns/AllocationTable`: the table lives in
  the procurement feature and moves to the patterns folder in Sprint 22 when
  customers reuse it, as the release file plans.
- A popover calendar on the date inputs (native inputs, as in Sprint 18).

## Verification

Run locally on macOS, Node 24.15.0:

- `npm run format:check`: passed
- `npm run lint` (ESLint with hooks and a11y rules, stylelint): passed,
  zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 307 passed, 10 skipped, including the
  two new route tests for the draft update (permission and payload)
- `npm run test --workspace frontend`: 152 passed (71 files), including
  `ProcurementPages.test.tsx` (supplier list without identifiers and
  creation; the AS-005 editor with a converted unit, partial terms, the due
  date rule and the posting impact; cancellation with a reason; the AS-V2-16
  payment split at 360 px with the excess and remainder readouts; the
  purchase list with the overdue badge and the ledger balance)
- `npm run build`: passed; initial JavaScript 194.5 kB gzip against the
  250 kB budget (the procurement pages are lazy chunks)
- `npm run openapi:check` and `npm run api:types`: regenerated and in sync
- `npm run e2e --workspace frontend` (Playwright on the system Brave
  browser): 9 passed, 1 skipped by design, at 360 and 1280 px: the shell
  smoke (`Achats` now checked by heading), the catalogue and stock flows and
  the procurement flow below
- `npm run screen:review --workspace frontend`: login, home, the five
  catalogue and stock routes, the four procurement routes and one V1 route
  at 360, 430, 768 and 1280 px, no horizontal overflow

Acceptance scenarios:

| ID       | Where                                                                                                                                                                                                                                | Result |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| AS-004   | `e2e/procurement.spec.ts` and `ProcurementPages.test.tsx`: a payment against open purchases reduces the supplier balance and the remaining due, and is refused above the amount owed by the server                                   | pass   |
| AS-005   | `e2e/procurement.spec.ts` and `ProcurementPages.test.tsx`: 4 sacs of flour at 1,250 TND per kg entered in sacs, normalised to 200 kg, total 250,000; partial terms require the due date; the posting impact states stock and payable | pass   |
| AS-V2-16 | `e2e/procurement.spec.ts` at 360 and 1280 px and `ProcurementPages.test.tsx` at 360 px: 300,000 TND allocated 200,000 + 100,000 across two open purchases, nothing left unallocated, balance reduced on the supplier page            | pass   |

## UX acceptance checklist

Executed for the seven screens against `09_UX_ACCEPTANCE_CHECKLIST.md`.
Owner decision: no screenshot images; the automated checks are the
evidence.

| Section                        | Result                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A Layout and responsiveness    | pass: `screen:review` at four widths on the four list and editor routes, card mode below 600 px on every list, the editor's totals column stacks under the lines on phones and sticks on desktop, dialogs as bottom sheets on phones |
| B Brand and visual consistency | pass: tokens only, `PageHeader` + `FilterBar` + `DataTable` on every list, `StatusPill` for document and payment states, money right-aligned with tabular numerals, one `TotalsCard` and one `PaymentBox` reused                     |
| C Copy and localisation        | pass: French with accents; terms, states and ledger entry types through `procurementLabels.ts`; no enum, id or key as primary content (asserted in the tests on both lists)                                                          |
| D Screen states                | pass: skeleton, background refresh, empty with next action, field and server errors mapped onto the form, denied through the route guard, error with retry, success toast after the server, pending posting non-closable             |
| E Business safety              | pass: posting and cancellation through `ConfirmPostingDialog` with the impact block and one idempotency key per intent; payments posted once with a key kept for the dialog's lifetime; cancellation reason required (5 to 300)      |
| F Accessibility                | pass: labels on every control (numbered line controls, named allocation inputs), focus trap in dialogs, radio semantics on the terms control, `aria-pressed` on the `En retard` toggle; `axe` still planned for Sprint 27            |
| G Performance                  | pass: server pagination and sort on every list; one ledger aggregate per purchase page instead of a request per row; raw material records cached in the editor so unit options never refetch                                         |

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- The price per line is per base unit, as the backend computes
  `normalizedQuantity × unitPriceTnd`; the editor says so on every line and
  in the lines card. A per-entered-unit price would be a backend change.
- Supplier sort by balance uses the endpoint's plain `sort=balance`, which
  restricts the page to suppliers with a ledger balance.
- `features/catalog/catalogApi.ts` survives as a shim until Sprint 26
  deletes the simulation V1 screen.
- No `v1.3.0` tag by owner decision (releases stay untagged).

## Merge Checklist

- [ ] CI passed
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] Screen spec delivered in full (07 section 4.3)
- [x] `12_SPRINT_STATUS_V2.md` and `CHANGELOG.md` updated
- [x] Target branch is `dev`

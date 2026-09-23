# R9 Sprint 23: Caisse (POS)

## Branches

- Source: `feature/r9-sprint-23-caisse`
- Target: `dev`

## Scope

Release R9 (module redesign wave 2), Sprint 23. Closes `UI-15`: the till
rebuilt on the kit following the seven-step recipe: session open and close
with the counted-cash dialog, the product grid with search and category
chips, the cart with a sticky total on phones, the customer picker, the
direct sale or order toggle, the payment box, the confirmation, the receipt
view, the sales list and the session history; desktop keyboard shortcuts.
The two V1 POS files are deleted (a two-line product lookup shim remains for
the V1 distribution screen until Sprint 24). One additive backend change
gives the lists the cashier names and per-session totals the spec names.

## Summary

- Screens rebuilt (07 section 4.6): `Caisse` (`/caisse`), `Ventes`
  (`/caisse/ventes`), `Vente` receipt (`/caisse/ventes/:id`), `Sessions`
  (`/caisse/sessions`), `Session` detail (`/caisse/sessions/:id`).
- Cart: `features/pos/cart.store.ts` (Zustand, in memory only, never
  persisted): lines, customer, mode, payment, order fields, derived totals
  with `decimal.js-light`, and one idempotency key per cart intent created
  with the cart and replaced only when it is cleared, so a retry after a
  lost response reuses it.
- Components added: `OpenSessionDialog` (float, key per open),
  `CloseSessionDialog` (on `ConfirmPostingDialog`: expected cash computed
  from the session totals as the source of truth defines it, counted cash,
  live difference in colour, notes, and the statement that the difference
  is recorded), `ProductSearch` (search box focused by the page, category
  chips derived from the loaded products so no catalogue permission is
  needed at the till), `ProductGrid` (tiles with a category tone bar, tap
  adds one, `+`/`−` on the tile once in the cart, a reserved stepper row so
  tiles never grow under a fast finger), `CartPanel` (stepper, quantity,
  unit price, line total, remove, `Vider le panier`), `CheckoutPanel` (Vente
  directe / Commande control, `PosCustomerCombobox` on `/pos/customers`
  with `Client de passage` default, `TotalsCard`, `PaymentBox` with change,
  credit rule messaging, a 56 px `Encaisser` that states why it is
  disabled), `SaleConfirmDialog` (compact summary; a sale posts with the
  cart key, an order posts then records its advance with a second key),
  `pos.tsx` (one lazy chunk for the five pages); `lib/hooks/useHotkeys`
  (`/` search, `Enter` adds the first result, `F2` customer, `F9` pay,
  `Esc` clears; plain keys ignored while typing, nothing while a dialog is
  open) with `Kbd` hints in the checkout panel.
- Phone layout (V1 UI guide section 8): the product list full screen with
  search and chips, a sticky bar with the total and article count and
  `Voir le panier`, the cart and payment in a bottom `Sheet` whose title
  carries the total and whose `Encaisser` sits at the bottom.
- API endpoints consumed (all under `/api/v1/pos`): `GET
/sessions/current`, `POST /sessions/open`, `POST /sessions/{id}/close`,
  `GET /products?q`, `GET /customers?q`, `GET/POST /sales`, `GET
/sales/{id}`, `GET /sessions`, `GET /sessions/{id}`; plus the order
  endpoints for the order mode.
- V1 files deleted: `features/pos/PosManagement.tsx` and, with it, the
  `customersApi.ts` and `ordersApi.ts` shims of Sprint 22. `posApi.ts` is
  replaced by a shim exporting the product lookup for the V1 distribution
  screen; it goes in Sprint 24.
- Backend (additive, no migration): the current session, the sales list
  and detail, the session list and detail carry the actors' display names
  (`openedBy`, `closedBy`, `postedBy`, one `findMany` per page); session
  rows carry `salesCount` and `salesTotalTnd` from one `groupBy`.

### Deliverables by requirement

| ID    | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-15 | Session-aware `Caisse`: empty state with `Ouvrir la caisse` (`pos.open_session`), `SessionBanner` with `Clôturer` (`pos.close_session`); desktop three panels and the phone list with the sticky bar and the cart sheet; grid with search, chips and tile steppers; cart with steppers; checkout with mode, customer, totals, payment with quick amounts and change, credit warning, order mode with `Retrait le` and `Acompte`; `ConfirmPostingDialog` with a compact summary and one key per cart intent; receipt view with `Nouvelle vente`; close dialog with expected cash, counted cash, live difference and notes; `Ventes` list with Référence, Heure, Client, Total, Payé, Reste, État, Caissier and today's period by default with client, state and session filters; `Sessions` list with the drawer figures and the difference in colour, detail with the BE-30 totals; desktop shortcuts |

## Out of Scope

- `Imprimer` on the receipt: waits for `OD-013` (Sprint 27, `OD-V2-004`).
- Long press on tiles: the `+`/`−` buttons cover the adjustment on phones
  without a hover or a gesture (V1 UI guide section 8).
- The cashier and session filters of `Ventes` as pickers: the session
  filter arrives through the link on the session detail; a cashier filter
  needs a user lookup the till does not have.
- Product images: none in V2 (`OD-V2-007`); a category tone bar instead.

## Verification

Run locally on macOS, Node 24.15.0:

- `npm run format:check`: passed
- `npm run lint` (ESLint with hooks and a11y rules, stylelint): passed,
  zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 307 passed, 10 skipped; the V1 POS
  route tests remain green with the added names and totals
- `npm run test --workspace frontend`: 164 passed (75 files), including
  `CaissePage.test.tsx` (the AS-V2-18 phone flow at 360 px: open with
  50,000, three products with an adjustment, 25,000 paid on 21,400 with the
  change stated, a partial credit sale refused without a customer then
  accepted for Amel Trabelsi with 8,000 carried, the close with 81,400
  expected, 80,000 counted and −1,400 shown before confirming; AS-008
  anonymous credit refused with the French reason on the disabled button;
  AS-019 and AS-V2-19 lost response then retry with the same key, one sale;
  the session list without identifiers)
- `npm run build`: passed; initial JavaScript 195.2 kB gzip against the
  250 kB budget; POS route chunk `pos-*.js` 11.1 kB gzip against the 120 kB
  budget
- `npm run openapi:check` and `npm run api:types`: in sync (response shapes
  are not described by the schemas, so the document is unchanged)
- `npm run e2e --workspace frontend` (Playwright on the system Brave
  browser): 13 passed, 1 skipped by design, at 360 and 1280 px: the shell
  smoke (`Caisse` now checked by heading, the login round-trip moved to
  `/distributeurs`), the four module flows and the till flow below
- `npm run screen:review --workspace frontend`: login, home, the fifteen
  rebuilt routes and one V1 route at 360, 430, 768 and 1280 px, no
  horizontal overflow

Acceptance scenarios:

| ID       | Where                                                                                                                                                                                                                                                                                            | Result |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| AS-003   | Backend `pos.service.test.ts` (unchanged); the UI opens through one dialog with one key and shows the server's refusal when a session already exists                                                                                                                                             | pass   |
| AS-006   | `CaissePage.test.tsx` and `e2e/caisse.spec.ts`: a fully paid sale posts with `remainingDueTnd` 0 and state `PAID`; stock and revenue effects are the backend's, exercised by its tests                                                                                                           | pass   |
| AS-007   | `CaissePage.test.tsx` and `e2e/caisse.spec.ts`: a registered customer's sale paid in part posts with the remainder on the customer's account, revenue once on the sale                                                                                                                           | pass   |
| AS-008   | `CaissePage.test.tsx` and `e2e/caisse.spec.ts`: without a customer the till refuses a partial sale and shows "Un client enregistré est obligatoire pour une vente à crédit."                                                                                                                     | pass   |
| AS-019   | `CaissePage.test.tsx` and `e2e/caisse.spec.ts`: the server commits, the response is lost, the retry sends the same key, one sale, the receipt shows the original reference                                                                                                                       | pass   |
| AS-V2-18 | `e2e/caisse.spec.ts` at 360 and 1280 px and `CaissePage.test.tsx` at 360 px: open, three products, one adjusted, change, credit sale for a registered customer, close with the difference shown before confirming; the total stays visible in the sticky bar and in the sheet title on the phone | pass   |
| AS-V2-19 | Same tests: network drop after `Encaisser`, retry, same key, one sale                                                                                                                                                                                                                            | pass   |

## UX acceptance checklist

Executed for the five screens against `09_UX_ACCEPTANCE_CHECKLIST.md`.
Owner decision: no screenshot images; the automated checks are the
evidence.

| Section                        | Result                                                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Layout and responsiveness    | pass: `screen:review` at four widths on the three list routes; the till is a full-screen list with a sticky bar and a bottom sheet below 600 px and three panels above 900 px; tiles keep a constant height; 44 px steppers, 56 px `Encaisser` |
| B Brand and visual consistency | pass: tokens only (inverse tokens for the sticky bar, chart tones for category bars), `PageHeader`, `SessionBanner`, `TotalsCard`, `PaymentBox`, `ConfirmPostingDialog`, `StatusPill`, `KpiTile` reused unchanged                              |
| C Copy and localisation        | pass: French with accents; payment states as `Payée`, `Partielle`, `Impayée`; cashiers by name; no enum, id or key as primary content (asserted on the session list)                                                                           |
| D Screen states                | pass: skeleton, background refresh, empty state with the next action, server errors in the dialogs with retry, denied through the route guard, success toast after the server, pending posting non-closable                                    |
| E Business safety              | pass: sale, order and close through `ConfirmPostingDialog` with an impact block; one key per cart intent reused on retry; the credit rule enforced in the UI and by the server; the difference shown before the close is confirmed             |
| F Accessibility                | pass: named tile and stepper buttons, the sticky bar as a named status region, the sheet titled with the total, focus trap in dialogs, keyboard shortcuts documented with `Kbd`; `axe` still planned for Sprint 27                             |
| G Performance                  | pass: one product page of sixty per search, debounced; names and totals batched per page on the server; the POS chunk at 11.1 kB gzip                                                                                                          |

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- The order mode posts the order and then its advance as two commands with
  two keys; a lost response between them leaves an order without its
  advance, which the order detail lets the cashier add.
- `posApi.ts` survives as a two-line shim until Sprint 24 deletes the V1
  distribution screen; `catalogApi.ts` until Sprint 26.
- No `v1.4.0` tag by owner decision (releases stay untagged).

## Merge Checklist

- [ ] CI passed
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] Screen spec delivered in full (07 section 4.6)
- [x] `12_SPRINT_STATUS_V2.md` and `CHANGELOG.md` updated
- [x] Target branch is `dev`

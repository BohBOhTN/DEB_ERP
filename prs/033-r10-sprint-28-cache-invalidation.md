# R10 Sprint 28: Cache et invalidation de l'état serveur

## Branches

- Source: `feature/r10-sprint-28-cache-invalidation`
- Target: `dev`

## Scope

Release R10, Sprint 28 as re-planned by the owner on 2026-09-24: the
deployment sprint is deferred and this sprint fixes how the frontend
caches server state. Closes `UI-26` (new): one cache policy with named
tiers, one typed invalidation map driven by domain events, every query key
from a module factory, and the reference data warmed once per session. No
backend change, no migration, no screen redesign.

## Problem

Every query shared one setting: thirty seconds of staleness and a refetch
on every window focus. Units, categories, expense categories, the
permission catalogue and roles were therefore re-read on every return to
the tab and on every dialog that needed them. Every mutation invalidated
its whole module root plus neighbouring roots typed as string literals in
twelve files: renaming a customer refreshed the till, the order queue and
the home summary; posting an expense refreshed nothing outside expenses
but a product rename refreshed every stock query. Four pages held inline
`queryKey` arrays outside any factory. Aegis, the reference codebase,
keeps its static data for minutes, never refetches on focus, and funnels
its financial writes through one invalidation set.

## Summary

- `lib/query/cachePolicy.ts`: four tiers spread into every hook.
  `reference` (30 min stale, 24 h kept, never on focus): units,
  categories, expense categories, permission catalogue, roles, audit
  filters, build identity. `list` (30 s, previous page kept, focus): every
  paginated table and the statements. `document` (60 s, focus): every
  detail. `live` (15 s, focus): the open till, stock balances, custody, the
  home summary (which keeps its 60 s interval). The till's product grid
  keeps its documented 60 s.
- `lib/query/invalidation.ts`: twenty-one domain events
  (`catalog.product`, `catalog.rawMaterial`, `catalog.reference`,
  `inventory.movement`, `procurement.supplier|purchase|payment`,
  `customer.record|payment`, `order`, `pos.session|sale`,
  `distribution.distributor|sale|dispatch|settlement|payment`, `expense`,
  `expense.category`, `simulation`, `access`) mapped to query roots; every
  event also refreshes the audit journal; `useInvalidateAfter(event)` is the
  `onSuccess` of every mutation and `invalidateAfter` serves the version
  conflict reload of the catalogue dialogs. `primeDetail` writes an updated
  product, raw material, customer, supplier or distributor into its detail
  key before the refetch so an edit never flashes old values.
- Key factories completed: `catalogKeys` gains `reference` sub-keys for
  units and categories (so the map can refresh them apart from the lists)
  and `related` keys for a record's audit trail and purchases;
  `posKeys.products`; a `settings.queries.ts` for the build identity; the
  simulation editor reads units through the catalogue hook. No inline
  `queryKey` remains in a page or component, and no string-literal
  invalidation remains in the modules.
- Reference warm-up: `app/referenceWarmup.ts` prefetches units and
  categories as soon as the session is known for users who may see the
  catalogue, purchases or simulations, loading the catalogue module on
  demand so the shell bundle stays flat.
- Precise cross-module effects, as the map now states them: a customer
  rename refreshes customer lists and details only; a customer payment
  refreshes customers, the open till and home; a POS sale refreshes the
  till, sales, stock, customers, orders and home but not the catalogue; a
  unit or category change refreshes the reference caches, the product and
  raw material lists (which print them) and the till grid, not stock; a
  permission change refreshes access and the caller's session.

## Out of Scope

- Persisting the cache in the browser: server state stays in memory (03
  section 4 verdict, 06 section 1); reference data survives navigation, not
  a reload.
- The tables and row actions (Sprint 29).

## Verification

Run locally on macOS, Node 24.15.0:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace frontend`: 198 passed (87 files), including
  `cachePolicy.test.ts`, `invalidation.test.ts` (AS-V2-27 at the map level:
  a POS sale refreshes the till, sales, stock, customers, orders and home
  and not the catalogue; a customer rename touches neither stock nor the
  till; a unit change refreshes its readers; every event follows with the
  audit; the client is called once per root) and `referenceCache.test.tsx`
  (AS-V2-26 with the requests counted through msw: units and categories
  read once by the warm-up, reused by the product and raw material dialogs
  on two pages, the products list served from its cache on a return, the
  settings table adding its own page read, a unit rename triggering
  exactly one re-read of the active units table, then one of the reference
  and one of the product list when the products page is opened again; a
  window focus two minutes later re-reads the products list and not the
  reference data)
- `npm run test --workspace backend`: unchanged, backend untouched
- `npm run build`: passed; initial JavaScript 199.9 kB gzip against the
  250 kB budget; POS chunk 11.3 kB
- `npm run e2e --workspace frontend` (Playwright on the system Brave
  browser, three widths, mocked API): 118 passed, 2 skipped by design
- `npm run screen:review --workspace frontend`: thirty routes at four
  widths, no horizontal overflow

Request counts (the exit gate asks for them), measured with the same
scripted path run on `dev` in a temporary worktree and on this branch:
products, raw materials with a dialog each, products again, two minutes
later a window focus and the product dialog again, the settings table, a
unit rename, then products with its dialog once more.

| Endpoint              | Before (dev) | After (this branch) |
| --------------------- | ------------ | ------------------- |
| `/catalog/units`      | 5            | 4                   |
| `/catalog/categories` | 2            | 1                   |
| `/catalog/products`   | 3            | 3                   |

Within a thirty-second window the two behave alike; the difference is the
window focus two minutes later, where `dev` re-read units and categories
and this branch re-read only the products list, and it grows with every
focus and every dialog of a working day. The demo replay in CI carries no
request counter yet; adding one is a follow-up.

Acceptance scenarios:

| ID       | Where                                                                                                                | Result |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ------ |
| AS-V2-26 | `referenceCache.test.tsx`: reference data fetched once per session and again only after its own mutation             | pass   |
| AS-V2-27 | `invalidation.test.ts` and the end of `referenceCache.test.tsx`: a mutation refreshes exactly the screens it affects | pass   |

## Fixes found by the seeded demo replay

The CI `demo` job of Sprint 27 failed on its first real run; running the
seed and the replay against a local PostgreSQL surfaced real defects, fixed
here and each verified by typecheck, lint and the suites above:

- Demo seed: purchase totals were computed per entered unit while the API
  prices per base unit, so paid terms were refused; order advances are cash
  at the till, so today's session now stays open while they are recorded;
  the demo customer starts with a clean balance.
- Command palette: server results were hidden by cmdk's own filter; the
  palette now filters its static items itself and shows server results as
  returned.
- Customer picker: a cashier without `customer_balances.view` could not
  pick a customer for an order; the combobox now falls back to the plain
  directory.
- Payment dialogs: the customer and supplier payment commands answer
  without the nested party object that the mocks and the list rows carry,
  so the success toast threw after a successful payment; the toasts name
  the party from the form and the created types no longer promise it.
- Reference warm-up: gated by `units.view` and `categories.view` so a
  cashier no longer triggers refused requests at sign-in.

By owner decision the automated demo replay is parked: the demo will be
shown manually and the replay revisited once the features are complete.
The `demo` job moved to a manual workflow (`demo.yml`,
`workflow_dispatch`) so it never blocks a pull request; its spec keeps the
label fixes made so far and still fails on later steps.

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- A reference read is now kept for thirty minutes: a unit or category
  created by another user on another device appears after that delay or
  after the next reload. The bakery has one back office, so the trade is
  accepted; the tier is one constant if it needs to move.
- Request counts on the CI demo replay are not measured yet.
- Sprint 29 follows with the tables and row actions.

## Merge Checklist

- [ ] CI passed
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] `12_SPRINT_STATUS_V2.md` and `CHANGELOG.md` updated
- [x] Target branch is `dev`

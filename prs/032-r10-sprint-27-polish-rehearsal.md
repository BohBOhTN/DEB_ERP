# R10 Sprint 27: Cross-cutting polish and stakeholder rehearsal

## Branches

- Source: `feature/r10-sprint-27-polish-rehearsal`
- Target: `dev`

## Scope

Release R10 (polish, operations, launch), Sprint 27. Closes `UI-22` to
`UI-25`: the command palette and the print stylesheet, the polish and
performance pass, the end-to-end and accessibility suites with Lighthouse,
the full UX checklist on every screen, and the demo seed with the
rehearsal of the stakeholder script. No business feature is added and no
migration is created. The backend gains one script, the demo seed, which
only calls the existing services.

## Summary

- **Command palette** (UI-22): `components/patterns/CommandPalette` on
  `cmdk` inside the kit `Dialog`, opened with `Ctrl+K` / `⌘K` or the
  "Rechercher" trigger in the desktop top bar (hidden on phones). Sources in
  `app/palette.tsx`: the navigation manifest filtered by permission, five
  actions (Nouvelle vente, Nouvelle commande, Nouvel achat, Nouvelle sortie,
  Nouvelle simulation) behind their permissions, and a server search from
  two characters over customers, products and suppliers through their `q`
  endpoints, debounced 250 ms. The palette and its search clients load on
  first open so the initial bundle stays flat.
- **Print** (UI-22): `styles/print.css` hides the shell, filters and
  controls and prints tables in full; an `Imprimer` button on the customer,
  supplier and distributor statements. No A6 ticket: `OD-013` / `OD-V2-004`
  is still open, so the default (none) applies.
- **Polish** (UI-23): `components/ui/Illustration` with four line-art
  drawings in brand colours (shelf, ledger, basket, compass); empty tables
  show the ledger, the 404 page the compass, and `EmptyState` accepts an
  `illustration`; a press effect on buttons; a web manifest so the app is
  installable (no offline logic); sticky table headers, row hover, toast
  slide and skeleton shimmer were already in the kit and are kept.
- **Performance** (UI-23): the logo goes from a 474 kB PNG to WebP at 512 px
  (87 kB, login) and 192 px (18 kB, shell and splash); page chunks preload
  when the pointer rests on a navigation link (`app/routeLoaders.ts`,
  shared with the router); the palette is lazy; query `staleTime` stays at
  30 s by default with five-minute caches on catalogues.
- **End-to-end suite** (UI-24): a `tablet-768` Playwright project joins
  `phone-360` and `desktop-1280` for the mocked flows, which already cover
  the eight critical flows of the V1 testing guide plus session close and
  permission change; the shell smoke handles the tablet drawer. A second
  configuration, `playwright.seeded.config.ts`, runs `e2e-seeded/demo.spec.ts`
  against the real API on a seeded database at the presenter's widths (390
  and 1280 px): the stakeholder script sections 1 to 5, with the numbers the
  script reads aloud asserted.
- **Accessibility audit** (UI-24): `e2e/a11y.spec.ts` runs axe (WCAG 2.1 AA
  and best practices) on thirty routes at the three widths; serious and
  critical violations fail the build, lower impacts are printed. Two defects
  found and fixed: placeholder text below 4.5:1 (`--text-muted` darkened
  from `#8a8f96` to `#6b7078`) and the password toggle inside an
  `aria-hidden` suffix (affixes are no longer hidden). `scripts/lighthouse.mjs`
  scores routes on the phone profile with the session cookie of a login,
  thresholds accessibility ≥ 95 and performance ≥ 80.
- **Demo seed and rehearsal** (UI-25, OD-V2-013): `backend/src/scripts/demoSeed.ts`
  (entry `ops/demo-seed.ts`, `npm run demo:seed`) builds the synthetic French
  bakery through the services: 40 products in 6 categories, 25 raw materials
  with bag conversions, 8 suppliers and 30 purchases (some overdue, some
  partly paid), 60 customers, 14 closed till sessions with cash and credit
  sales, 20 orders across statuses for today and tomorrow with advances,
  3 distributors with settled and open dispatches, 3 months of expenses,
  4 simulations, 6 accounts with 5 roles (`proprietaire@demo.tn` Super
  Admin, `caissier@demo.tn`, `achats@demo.tn`, `gerant@demo.tn`,
  `comptable@demo.tn`, `vendeuse@demo.tn`; password `Demo2026!`). It
  refuses a database that already holds users unless `--reset` is passed
  together with `DEMO_SEED_ALLOW_RESET=1`, so the shared development
  database cannot be wiped by accident; `--size small` seeds a quarter for
  CI. The seeded PRNG makes two runs tell the same story.
- **CI**: a `demo` job after `quality` migrates a fresh PostgreSQL, seeds it,
  starts the built API, replays the demo script in the browser at both
  widths, then runs Lighthouse on the served build; its report and the API
  log are uploaded as evidence.

### Deliverables by requirement

| ID    | Delivered                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-22 | Command palette with navigation, actions and server search; print stylesheet and `Imprimer` on the three statements; no ticket (decision open)                            |
| UI-23 | Illustrations for empty states and 404, button press, manifest, WebP logo, route preload on hover, lazy palette; bundle 199.7 kB gzip initial                             |
| UI-24 | Three-width mocked suite, axe on thirty routes, two accessibility fixes, Lighthouse runner with thresholds, seeded demo replay and CI job                                 |
| UI-25 | Demo seed through the services with the script's accounts and volumes; automated rehearsal of the script in CI; the checklist results table below; rehearsal record noted |

## Out of Scope

- The A6 ticket (`OD-013` / `OD-V2-004` open).
- Offline mode and push notifications: the manifest only makes the app
  installable.
- A French dictionary for audit field names (Sprint 26 follow-up).

## Verification

Run locally on macOS, Node 24.15.0, without a local PostgreSQL:

- `npm run format:check`: passed
- `npm run lint` (ESLint with hooks and a11y rules, stylelint): passed,
  zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 307 passed, 10 skipped (no service
  changed; the seed script is type-checked)
- `npm run test --workspace frontend`: 189 passed (84 files), including
  `CommandPalette.test.tsx` (word filtering and selection, server search
  after two characters grouped by kind), `Illustration.test.tsx`, the
  updated `TextInput.test.tsx` (a suffix control stays reachable) and the
  kit gallery registration of the two new components
- `npm run build`: passed; initial JavaScript 199.7 kB gzip against the
  250 kB budget (196.2 kB before the sprint; the palette trigger, the
  illustrations and the print stylesheet account for the difference); POS
  chunk 11.2 kB against 120 kB
- `npm run e2e --workspace frontend` (Playwright on the system Brave
  browser): 118 passed, 2 skipped by design, across `phone-360`,
  `tablet-768` and `desktop-1280`: the shell smoke, the seven module flows,
  the access flow and the thirty-route axe audit at every width
- `npm run screen:review --workspace frontend`: thirty routes at 360, 430,
  768 and 1280 px, no horizontal overflow
- `npm run lighthouse --workspace frontend -- --routes /connexion` against
  `vite preview` (the only route reachable without a backend here):
  performance 84, accessibility 100, best practices 96 on the phone profile
- Not run locally, runs in the new CI `demo` job: the demo seed against a
  PostgreSQL, the seeded demo replay (`npm run e2e:seeded`) and Lighthouse
  on the signed-in routes. This machine has no PostgreSQL or Docker, and the
  shared remote development database is not a place for synthetic data.
  The first CI run of this branch is the evidence for those three items;
  defects it reveals are fixed on the branch before merge.

Acceptance scenarios:

| ID       | Where                                                                                                                                                                                                                      | Result                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| AS-020   | `screen:review` (four widths, thirty routes) and the mocked suite at three widths, both green; the screenshot matrix is waived by the owner's decision, the overflow assertions replace it                                 | pass                      |
| V1 AS-\* | Every V1 scenario exercised through the V2 UI by the mocked flows (`catalogueStock`, `procurement`, `customersOrders`, `caisse`, `distribution`, `expensesSimulation`, `access`, `shell`) now at phone, tablet and desktop | pass                      |
| AS-V2-23 | `e2e-seeded/demo.spec.ts` on the seeded API at 390 and 1280 px: sections 1 to 5 of the script with the read-aloud numbers asserted; French-only copy checked on each main region                                           | pending the CI `demo` job |

## UX acceptance checklist

Executed on every screen against `09_UX_ACCEPTANCE_CHECKLIST.md`. Owner
decision: no screenshot images; the automated checks are the evidence.

| Section                        | Result on every screen                                                                                                                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Layout and responsiveness    | pass: no overflow on thirty routes at four widths; the shell smoke opens every module at 360, 768 (drawer) and 1280 px; tables become cards below 600 px; dialogs become bottom sheets on phones; touch targets at 44 px through the kit's control height                     |
| B Brand and visual consistency | pass: stylelint forbids raw and named colours outside `tokens.css`; every page is built from `PageHeader`, `FilterBar`, `DataTable`, `Card`; statuses through `StatusPill`; gold and terracotta only as accents (the accent badge uses the warning text colour)               |
| C Copy and localisation        | pass: French with accents; the demo replay asserts no English word on the main regions it visits; labels follow the vocabulary table; no key or id as primary content (asserted in the module tests)                                                                          |
| D Screen states                | pass: skeleton, background refresh, empty with illustration and next action, field and server errors, denied through the route guard, error with retry, success toast after the server, pending posting not closable, stale version refused                                   |
| E Business safety              | pass: every posting through `ConfirmDialog` with its impact block; one idempotency key per intent (expense commands use the version, recorded follow-up); reasons required where the source of truth demands                                                                  |
| F Accessibility                | pass: axe reports no serious or critical issue on thirty routes at three widths after the two fixes; landmarks and one `h1` per page (the 404 page uses the empty state's title, by design); focus rings from the token; `prefers-reduced-motion` disables animation globally |
| G Performance                  | pass: initial bundle 199.7 kB of 250 kB; server pagination everywhere; search debounced (palette 250 ms, comboboxes as before); React Query cache on tab switch; Lighthouse performance 84 on the login page on the phone profile, the signed-in routes scored in CI          |

Sign-off: Sprint 27, all screens, executed by the assistant on
2026-09-24, result pass with the waiver above.

## Database and Migration Impact

None. The demo seed writes through the services and is never run against
the shared development database by this sprint.

## Environment Impact

Two frontend dev dependencies added: `@axe-core/playwright` and
`lighthouse`. Two optional variables for the seeded runs: `API_PROXY_TARGET`
(Vite forwards `/api` to it) and `API_URL` / `APP_URL` for the Lighthouse
runner. `DEMO_SEED_ALLOW_RESET=1` gates the seed's `--reset`.

## Risks and Follow-Up

- The seeded demo replay and the signed-in Lighthouse scores run only in
  CI for now; the first run of this branch settles them and any defect is
  fixed here. A human rehearsal on a phone and a laptop against the seeded
  staging of Sprint 28 remains to be recorded in the script's table by the
  presenter.
- The demo script's account names (`proprietaire@demo`) are not valid
  e-mail addresses for the login form; the seed uses `@demo.tn`.
- The A6 ticket waits for `OD-013`.

## Merge Checklist

- [ ] CI passed, including the new `demo` job
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] `12_SPRINT_STATUS_V2.md` and `CHANGELOG.md` updated
- [x] Target branch is `dev`

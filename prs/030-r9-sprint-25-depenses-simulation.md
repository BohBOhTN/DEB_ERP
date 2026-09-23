# R9 Sprint 25: Dépenses and simulation de coût

## Branches

- Source: `feature/r9-sprint-25-depenses-simulation`
- Target: `dev`

## Scope

Release R9 (module redesign wave 2), Sprint 25. Closes `UI-17` and `UI-18`:
the expenses report and table with its dialogs and categories, and the cost
simulation list, editor and detail, rebuilt on the kit following the
seven-step recipe. The four V1 files are deleted. One additive backend
change counts the expenses per category. Charts use the design system
`BarChart` and `Sparkline` only; every simulation screen states that
nothing affects stock or accounting.

## Summary

- Screens rebuilt (07 sections 4.8 and 4.9): `Dépenses` (`/depenses`),
  `Catégories de dépenses` (`/depenses/categories`), `Simulation de coût`
  (`/simulations`), `Nouvelle simulation` (`/simulations/nouvelle`),
  `Simulation` detail (`/simulations/:id`), `Modifier la simulation`
  (`/simulations/:id/modifier`).
- Expenses: `features/expenses/{expenses.api,expenses.queries,expenses.schemas}.ts`,
  `pages/ExpensesPage` (period control Ce mois / Mois dernier /
  Personnalisée as business days, `KpiTile` total with the posted count,
  horizontal `BarChart` of the top six categories, `Sparkline` by day, then
  the table with category, status and period filters, sort in the URL and
  the row actions Valider, Modifier, Annuler), `pages/ExpenseCategoriesPage`
  (name, description, expense count, activation instead of deletion),
  `components/ExpenseFormDialog` (date, category with the "Gérer les
  catégories" link, label, amount, reference, notes, `Valider
immédiatement` switch; the draft editor carries the version),
  `CancelExpenseDialog` (`ConfirmDialog` with a 5 to 300 character reason
  and the spec's impact sentence), `ExpenseCategoryFormDialog`,
  `expenseLabels` (Brouillon, Validée, Annulée).
- Simulation: `features/simulation/{simulation.api,simulation.queries,simulation.schemas}.ts`,
  `pages/SimulationsPage`, `pages/SimulationEditorPage` (name, optional
  target product, output quantity and unit, notes; the ingredient lines;
  the sticky totals), `pages/SimulationDetailPage` (read view with
  Dupliquer, Modifier, Supprimer), `components/IngredientLineEditor` (per
  line a `Matière première` / `Ingrédient libre` toggle; the raw material
  through the shared `ItemCombobox` with units from its conversions, the
  price per base unit defaulted from the last posted purchase when it can
  be read; a free ingredient priced in its own unit; the line cost live),
  `SimulationTotalsCard` (ingredient cost, unit cost, an indicative margin
  from the target product's sale price, labelled as information only),
  `DeleteSimulationDialog`. `simulations.update` is wired to the editor.
- API endpoints consumed (all under `/api/v1`): `GET/POST/PATCH
/expense-categories`; `GET/POST /expenses`, `GET/PATCH /expenses/{id}`,
  `POST /expenses/{id}/post`, `POST /expenses/{id}/cancel`; `GET
/expense-totals`; `GET/POST /cost-simulations`, `GET/PATCH/DELETE
/cost-simulations/{id}`, `POST /cost-simulations/{id}/duplicate`; plus
  `GET /catalog/units`, `/catalog/raw-materials`, `/catalog/products` and
  `GET /procurement/purchases?rawMaterialId` for the editor.
- V1 files deleted: `features/expenses/ExpenseManagement.tsx`,
  `expensesApi.ts`, `features/simulation/SimulationManagement.tsx`,
  `simulationApi.ts`. `catalogApi.ts` survives for the audit screen until
  Sprint 26.
- Backend (additive, no migration): expense categories carry
  `expenseCount` from one `_count` in the list query.

### Deliverables by requirement

| ID    | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-17 | Period control and the three totals blocks; table with Référence, Date, Catégorie, Libellé, Montant, Payé par, Statut; category, status and period filters; sort by date and amount; the expense dialog with the immediate posting switch; row actions Valider (draft, with impact), Modifier (draft), Annuler (posted, reason 5 to 300 with the spec's impact sentence); the categories page with counts and activation                                  |
| UI-18 | Simulation table with Nom, Produit visé, Quantité produite, Coût total, Coût unitaire, Modifiée le; full-page editor with the header fields, ingredient lines (raw material or free text, units from conversions, snapshotted prices, line cost), sticky totals with ingredient cost, unit cost and the indicative margin; the "no stock nor accounting effect" banner on every screen; detail with Dupliquer, Modifier (`simulations.update`), Supprimer |

## Out of Scope

- Overhead, packaging, energy or labour in the cost (`SIM-010`, open):
  the margin helper is information only and says so.
- Automated conversion of a simulation into a recipe (`SIM-009`,
  deferred).
- Treasury accounts and payroll (`EXP-009`, `EXP-010`, deferred): the
  payment method is cash and salaries are a category.

## Verification

Run locally on macOS, Node 24.15.0:

- `npm run format:check`: passed
- `npm run lint` (ESLint with hooks and a11y rules, stylelint): passed,
  zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 307 passed, 10 skipped; the V1
  expense and simulation route tests remain green with the added count
- `npm run test --workspace frontend`: 178 passed (80 files), including
  `ExpensesPage.test.tsx` (the business-day period ranges; the month report
  at 920,000 with two posted expenses, AS-017 and AS-V2-21 cancellation of
  `DEP-000001` with a reason, the row shown as `Annulée` and the total down
  to 800,000 with one posted expense; an expense posted at once from the
  dialog at 360 px; category counts and deactivation) and
  `SimulationPages.test.tsx` (AS-018 formulas: 6,350 for 50 pieces is
  0,127, a converted unit; the editor with a raw material and a free
  ingredient and the live unit cost; a saved scenario at 0,127 per piece
  duplicated then deleted at 360 px)
- `npm run build`: passed; initial JavaScript 196.2 kB gzip against the
  250 kB budget; POS chunk 11.2 kB against 120 kB
- `npm run openapi:check` and `npm run api:types`: in sync; every client
  path checked against the document by `contractPaths.test.ts`
- `npm run e2e --workspace frontend` (Playwright on the system Brave
  browser): 17 passed, 1 skipped by design, at 360 and 1280 px: the shell
  smoke (`Dépenses` now checked by heading, the login round-trip moved to
  `/utilisateurs`), the six module flows and the expenses and simulation
  flow below
- `npm run screen:review --workspace frontend`: login, home, the
  twenty-four rebuilt routes and one V1 route at 360, 430, 768 and 1280
  px, no horizontal overflow

Acceptance scenarios:

| ID       | Where                                                                                                                                                                                                                      | Result |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AS-017   | `ExpensesPage.test.tsx` and `e2e/expensesSimulation.spec.ts`: a cancelled expense stays in the table as `Annulée` with its reason, and the period total and posted count exclude it                                        | pass   |
| AS-018   | `SimulationPages.test.tsx` and `e2e/expensesSimulation.spec.ts`: 3 kg at 1,800, 0,1 at 9,000 and 0,05 at 1,000 for 50 pieces give 6,350 and 0,127 per piece; the screens state no stock or balance changes                 | pass   |
| AS-V2-21 | `ExpensesPage.test.tsx` and `e2e/expensesSimulation.spec.ts` at 360 and 1280 px: cancel with a reason, then the month view shows `Annulée`, the total drops from 920,000 to 800,000 and the chart totals follow the totals | pass   |

## UX acceptance checklist

Executed for the six screens against `09_UX_ACCEPTANCE_CHECKLIST.md`.
Owner decision: no screenshot images; the automated checks are the
evidence.

| Section                        | Result                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A Layout and responsiveness    | pass: `screen:review` at four widths on the four list and editor routes; the report blocks stack on phones and sit in three columns on desktop; card mode below 600 px; the ingredient fields stack two by two on phones       |
| B Brand and visual consistency | pass: tokens only, `PageHeader` + `FilterBar` + `DataTable`, `KpiTile`, `BarChart`, `Sparkline`, `TotalsCard`, `ConfirmDialog`, `StatusPill` reused; no other chart library                                                    |
| C Copy and localisation        | pass: French with accents; feminine statuses through `expenseLabels.ts`; no enum, id or key as primary content (asserted on the expenses table)                                                                                |
| D Screen states                | pass: skeleton, background refresh, empty with the next action, field and server errors, denied through the route guard, error with retry, success toast after the server, stale version refused                               |
| E Business safety              | pass: posting and cancellation through `ConfirmDialog` with the impact sentence and the record's version (the expense commands take no idempotency key; the version refuses a replay); the reason required; deletion confirmed |
| F Accessibility                | pass: labelled period control, named line groups and inputs, the banner as a note, focus trap in dialogs; `axe` still planned for Sprint 27                                                                                    |
| G Performance                  | pass: totals computed by the database per period; server pagination on the tables; categories cached a minute; the last purchase price read once per pick                                                                      |

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- The expense commands (`post`, `cancel`) carry a version rather than an
  idempotency key, as the API defines them; a network retry after a
  committed post is refused with `VERSION_CONFLICT`, which the dialog shows
  with a reload prompt. Aligning them with the key contract is a backend
  follow-up.
- The default ingredient price needs `purchases.view`; without it the
  price is typed.
- `catalogApi.ts` survives until Sprint 26 deletes the audit V1 screen.
- No `v1.4.0` tag by owner decision (releases stay untagged).

## Merge Checklist

- [ ] CI passed
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] Screen specs delivered in full (07 sections 4.8 and 4.9)
- [x] `12_SPRINT_STATUS_V2.md` and `CHANGELOG.md` updated
- [x] Target branch is `dev`

# R8 Sprint 20: Catalogue and stock

## Branches

- Source: `feature/r8-sprint-20-catalogue-stock`
- Target: `dev`

## Scope

Release R8 (module redesign wave 1), Sprint 20. Closes `UI-10` and `UI-11`:
products, raw materials, categories and units, stock balances, movements,
opening stock and adjustments rebuilt on the kit, following the seven-step
recipe of the release file. The four V1 files of the release file are
deleted; a fifteen-line compatibility shim keeps two helpers alive for the
V1 procurement and simulation screens until their own sprints. Three
additive backend changes give the screens the columns the spec names.

## Summary

- Screens rebuilt (07 sections 4.1 and 4.2): `Produits` (`/produits`),
  `Produit` detail (`/produits/:id`), `Matières premières`
  (`/matieres-premieres`), `Matière première` detail
  (`/matieres-premieres/:id`), `Catégories et unités`
  (`/catalogue/parametres`), `Stock` (`/stock`), `Mouvements`
  (`/stock/mouvements`).
- Components added: `features/catalog/{catalog.api,catalog.queries,catalog.schemas,related.api}.ts`,
  `pages/*` (five pages), `components/ProductFormDialog`,
  `RawMaterialFormDialog` with `ConversionsEditor`, `CategoryFormDialog`,
  `UnitFormDialog`, `detailTabs` (Stock, Mouvements, Historique, Achats),
  `catalogTable` (row actions, list defaults);
  `features/inventory/{inventory.api,inventory.queries,inventory.schemas,movementLabels}.ts`,
  `pages/StockPage`, `pages/MovementsPage`, `components/ItemCombobox`
  (shared with procurement and simulation later),
  `components/StockMovementDialog` (opening stock and adjustment: form,
  then `ConfirmPostingDialog` with the "passera de X à Y" impact, one
  idempotency key per intent).
- API endpoints consumed (all under `/api/v1`): `GET/POST/PATCH
/catalog/products`, `.../{id}`, `.../activation`; `GET/POST/PATCH
/catalog/raw-materials`, `.../{id}`, `.../activation`, `PUT
.../conversions`; `GET/POST/PATCH /catalog/categories`, `.../units`;
  `GET /inventory/balances`, `GET /inventory/movements`, `POST
/inventory/opening-stock`, `POST /inventory/adjustments`; `GET
/audit-events?entity=product&targetId=`; `GET
/procurement/purchases?rawMaterialId=`.
- V1 files deleted: `features/catalog/CatalogManagement.tsx`,
  `features/inventory/InventoryManagement.tsx`,
  `features/inventory/inventoryApi.ts`. `features/catalog/catalogApi.ts` is
  replaced by the shim described above (types re-exported from the V2 API,
  `getRawMaterials` and `getUnits` delegating to it); it goes with its last
  consumer in Sprint 26.
- Backend (additive, no migration): balances carry `unitSymbol` and
  `lastMovementAt` (`_max(occurredAt)` in the existing `groupBy`);
  movements carry `createdBy` and `sourceReference` (actors, purchases and
  sales batch-loaded for the page); the product list filters by
  `categoryId` and `isStockable` and sorts by `salePriceTnd` and
  `isActive`; the purchase list filters by `rawMaterialId`. The OpenAPI
  document and the generated types are regenerated.

### Deliverables by requirement

| ID    | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-10 | Product list with category chip, code, unit, price, stockable and status; search, category, status (active by default) and stockable filters and sort in the URL; creation and edition dialogs on `react-hook-form` + zod (name 2 to 120, price above zero); `PATCH` with `version`, reload prompt on `VERSION_CONFLICT`; activation through `ConfirmDialog` with the spec's impact text; detail with Stock, Mouvements and Historique tabs; raw materials with conversions and Achats tab; categories and units in tabs with dialogs |
| UI-11 | Stock balances with type chip, `StockBadge`, last movement, negative banner linking to the filtered view, `Négatifs seulement` chip, type filter, search and sort; opening stock and adjustment dialogs with the item picker (search over products and raw materials, current balance shown), Entrée/Sortie control plus a positive quantity, reason 5 to 300, impact confirmation; movements with French type labels, signed quantities, source with document reference, actor, filters in the URL                                   |

## Out of Scope

- The `Produits (count)` column of the categories tab: the API returns no
  product count per category; deferred to a backend aggregate.
- The CSV export button on movements: no export endpoint, hidden as the
  spec allows.
- Per-record source links on movements: the source column links to the
  module list with the document reference; detail routes arrive with the
  procurement and POS sprints.
- A popover calendar on the date filters (native inputs, as in Sprint 18).

## Verification

Run locally on macOS, Node 24.15.0:

- `npm run format:check`: passed
- `npm run lint` (ESLint with hooks and a11y rules, stylelint): passed,
  zero warnings
- `npm run typecheck`: passed, backend and frontend
- `npm run test --workspace backend`: 305 passed, 10 skipped; V1 catalogue
  and inventory route tests remain green
- `npm run test --workspace frontend`: 147 passed (70 files), including
  `ProductsPage.test.tsx` (list, detail navigation, creation without any
  identifier, stale-version reload, hidden actions without permission,
  empty and error states) and `StockPage.test.tsx` (balances with the
  negative banner and filter, adjustment through the picker with the impact
  confirmation at 360 px, movements with French labels and no identifier)
- `npm run build`: passed; initial JavaScript 193.3 kB gzip against the
  250 kB budget (the catalogue and stock pages are lazy chunks)
- `npm run openapi:check` and `npm run api:types`: regenerated and in sync
- `npm run e2e --workspace frontend` (Playwright on the system Brave
  browser): 7 passed, 1 skipped by design, at 360 and 1280 px: the shell
  smoke (rebuilt routes now checked by heading, legacy ones by badge) and the
  two catalogue and stock flows below
- `npm run screen:review --workspace frontend`: login, home, the five
  catalogue and stock routes and one V1 route at 360, 430, 768 and 1280
  px, no horizontal overflow

Acceptance scenarios:

| ID       | Where                                                                                                                                                                                                                        | Result |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AS-V2-14 | `e2e/catalogueStock.spec.ts` at 360 and 1280 px: create "Pain complet", opening stock 20 pièces, adjustment −2 "Casse"; both movements with French labels, balance 18, no identifier typed or shown (regex on the page text) | pass   |
| AS-V2-15 | `e2e/catalogueStock.spec.ts` and `ProductsPage.test.tsx`: edit while another save moved the version; reload prompt; reload shows 1,500; the store keeps the newer price                                                      | pass   |

## UX acceptance checklist

Executed for the seven screens against `09_UX_ACCEPTANCE_CHECKLIST.md`.
Owner decision: no screenshot images; the automated checks are the
evidence.

| Section                        | Result                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Layout and responsiveness    | pass: `screen:review` at four widths, card mode below 600 px on every list, dialogs as bottom sheets on phones, 44 px controls                                                                                            |
| B Brand and visual consistency | pass: tokens only, `PageHeader` + `FilterBar` + `DataTable` on every list, `StatusPill` for status, money right-aligned with tabular numerals                                                                             |
| C Copy and localisation        | pass: French with accents; movement and source types through `movementLabels.ts`; no enum, id or key as primary content (asserted in the flow and in `StockPage.test.tsx`)                                                |
| D Screen states                | pass: skeleton, background refresh, empty with next action, field and server errors, denied through the route guard, error with retry, success toast after the server, pending posting non-closable, stale version prompt |
| E Business safety              | pass: opening stock and adjustments through `ConfirmPostingDialog` with the impact block and one idempotency key per intent; activations through `ConfirmDialog` with impact; reasons required (5 to 300)                 |
| F Accessibility                | pass: labels on every control (`aria-label` on filter selects and the picker), focus trap in dialogs, radio semantics on the Entrée/Sortie control; `axe` still planned for Sprint 27                                     |
| G Performance                  | pass: server pagination and sort on every list except balances, which the API returns whole for the single location (tens of rows) and the page filters and pages client-side, stated in the code                         |

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- Backend follow-ups logged: product count per category; a `sourceReference`
  for distribution documents (only purchases and sales resolve today).
- The balances endpoint is unpaginated by design (one location); if a
  second location ever exists, the page must switch to server paging.
- `features/catalog/catalogApi.ts` survives as a shim until Sprints 21
  and 26 delete the procurement and simulation V1 screens.
- No `v1.3.0` tag by owner decision (releases stay untagged).

## Merge Checklist

- [ ] CI passed
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] Screen specs marked Implemented (07 sections 4.1 and 4.2)
- [x] `12_SPRINT_STATUS_V2.md` and `CHANGELOG.md` updated
- [x] Target branch is `dev`

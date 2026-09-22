# R6 Sprint 17: API v1 contract for the new frontend

## Branches

- Source: `feature/r6-sprint-17-api-v1-contract`
- Target: `dev`

## Scope

Release R6 (platform hardening), Sprint 17, the last backend sprint before
the frontend redesign. Closes `BE-25` to `BE-38` from the V2 remediation
plan. The V1 frontend keeps working unchanged on the `/api` prefix; the new
frontend builds against `/api/v1` and the committed OpenAPI document.

## Summary

- **`/api/v1` prefix and envelope** (BE-25, BE-26). Every router is mounted
  twice: under `/api/v1` and under the legacy `/api`, which answers with
  `Deprecation: true`. One handler serves both; `okFor` shapes the envelope
  from the prefix. On `/api/v1` a collection is `data: { items, page,
pageSize, total, pageCount }`; single resources and command results keep
  their named key on both prefixes.
- **One list contract** (BE-27). `shared/listQuery.ts` provides `page`,
  `pageSize`, `q` (alias of the V1 `search`), `sort=field:asc|desc` from a
  per-list whitelist with an id tiebreak, and `from`/`to` read as whole
  business days in `Africa/Tunis` (an exact instant is still accepted).
- **Detail endpoints** (BE-28, BE-29) for customers (with balances),
  suppliers, purchases (with payment state), distributors (balance and lines
  held), expenses, products, raw materials, users and roles, plus POS sales.
- **POS sessions** (BE-30). `GET /pos/sessions` (paged, filterable) and
  `GET /pos/sessions/{id}` with totals: sales count and amount, credit
  granted, cash collected, advances received and refunded, customer payments.
- **Home summary** (BE-31). `GET /home/summary?date=` returns
  permission-scoped blocks computed by the database: sales of the day and of
  the previous day, the open session, receivables, payables with overdue
  purchases, orders due today, overdue and ready, negative stock, expenses of
  the month, lines in custody and the last eight audit events with French
  labels. A block is `null` when the caller lacks its permission; the route
  needs a session only, as the screen spec (UI-08) requires.
- **Document references** (BE-32). Migration `add_document_references` adds
  the sequences `sale_reference_seq` and `purchase_reference_seq`, backfills
  existing rows in `postedAt` order, and makes `sales.reference` mandatory and
  unique (`VT-000001`) and `purchases.reference` unique once posted
  (`AC-000001`). POS sales, order completions and purchase postings take the
  next value inside their transaction.
- **Inventory** (BE-33). Movements filter by `itemType`, `itemId`,
  `movementType`, `sourceType`, `from`, `to`; `sourceType` is now the closed
  enum `InventorySourceType`.
- **Enums and ids** (BE-35, BE-36). The five payment-method enums are one
  `PaymentMethod`; the schema header states the identifier strategy
  (ADR-V2-001).
- **Audit labels** (BE-37). Events carry `actionLabelFr`, `entityLabelFr` and
  `targetModule`; the filters endpoint returns labelled options next to the
  raw values.
- **Access API** (BE-38). `GET /access/permissions` adds `groups` (by module,
  with short `labelFr` and `descriptionFr`); the catalogue now carries proper
  French labels and accents and a new `users.reset_password` key. `GET
/access/users` is paginated with `q`, `isActive`, `roleId` and `sort` on
  `/api/v1` (the legacy prefix keeps the whole array). Roles report
  `permissionCount` and `userCount`. `PATCH /access/users/{id}` changes the
  display name or e-mail under optimistic concurrency (`version`, new column
  by migration `add_user_version`). `POST /access/users/{id}/password-reset`
  sets a temporary password, ends every open session of the target, drops the
  cached permissions and audits without the password.
- **OpenAPI** (BE-34). `src/openapi/operations.ts` declares one record per
  route with its Zod request schemas, permissions, idempotency and response
  shape; `document.ts` renders OpenAPI 3.0.3 from them with Zod 4's own
  JSON-schema generator (no new backend dependency). `backend/openapi.json`
  is committed, served at `/api/v1/openapi.json` outside production, and
  checked for staleness by `npm run openapi:check` in CI. The frontend script
  `npm run api:types` (openapi-typescript) produces the committed
  `frontend/src/lib/api/types.gen.ts`, which CI also diffs. A test extracts
  every `router.<method>` from the route files and the mounts from `app.ts`
  and fails when a route has no record or a record has no route.

### Screen coverage (exit gate of the release file)

| Screen (07_SCREEN_INVENTORY_AND_IA.md) | Endpoints under `/api/v1`                                                                                                                    | Covered                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Accueil                                | `GET /home/summary`                                                                                                                          | Yes                                                 |
| Produits                               | `GET/POST /catalog/products`, `GET/PATCH /catalog/products/{id}`, `PATCH .../activation`                                                     | Yes                                                 |
| Matières premières                     | `GET/POST /catalog/raw-materials`, `GET/PATCH .../{id}`, `PATCH .../activation`, `PUT .../conversions`                                       | Yes                                                 |
| Catégories et unités                   | `GET/POST/PATCH /catalog/categories`, `GET/POST/PATCH /catalog/units`                                                                        | Yes                                                 |
| Stock                                  | `GET /inventory/balances`, `POST /inventory/opening-stock`, `POST /inventory/adjustments`                                                    | Yes                                                 |
| Mouvements                             | `GET /inventory/movements` with item, type, source and date filters                                                                          | Yes                                                 |
| Fournisseurs                           | `GET/POST /procurement/suppliers`, `GET/PATCH .../{id}`, `GET .../{id}/statement`                                                            | Yes                                                 |
| Achats                                 | `GET/POST /procurement/purchases`, `GET .../{id}`, `POST .../{id}/post`, `POST .../{id}/cancel`                                              | Yes                                                 |
| Paiements fournisseurs                 | `GET/POST /procurement/supplier-payments`, `GET /procurement/supplier-balances`                                                              | Yes                                                 |
| Clients                                | `GET/POST /customers`, `GET/PATCH /customers/{id}`, `GET .../statement`, `GET /customer-balances`, `GET/POST /customer-payments`             | Yes                                                 |
| File des commandes                     | `GET/POST /orders`, `GET/PATCH /orders/{id}`, `POST .../status`, `.../advances`, `.../complete`, `.../cancel`                                | Yes                                                 |
| Caisse                                 | `GET /pos/products`, `GET /pos/customers`, `GET /pos/sessions/current`, `POST /pos/sessions/open`, `POST .../{id}/close`, `POST /pos/sales`  | Yes                                                 |
| Ventes                                 | `GET /pos/sales`, `GET /pos/sales/{id}`                                                                                                      | Yes                                                 |
| Sessions                               | `GET /pos/sessions`, `GET /pos/sessions/{id}`                                                                                                | Yes                                                 |
| Distributeurs                          | `GET/POST /distributors`, `GET/PATCH /distributors/{id}`, `GET .../statement`                                                                | Yes                                                 |
| Dépôt-vente                            | `GET/POST /distributor-dispatches`, `GET .../{id}`, `GET/POST /distributor-settlements`, `GET /distributor-custody`                          | Yes                                                 |
| Règlements distributeurs               | `GET /distributor-balances`, `GET/POST /distributor-payments`, `POST /distributor-sales`                                                     | Yes                                                 |
| Dépenses                               | `GET/POST/PATCH /expense-categories`, `GET/POST /expenses`, `GET/PATCH /expenses/{id}`, `POST .../post`, `.../cancel`, `GET /expense-totals` | Yes; no `DEP-` reference (see follow-up)            |
| Simulation de coût                     | `GET/POST /cost-simulations`, `GET/PATCH/DELETE .../{id}`, `POST .../{id}/duplicate`                                                         | Yes                                                 |
| Utilisateurs                           | `GET/POST /access/users`, `GET/PATCH .../{id}`, `PUT .../roles`, `PATCH .../activation`, `POST .../password-reset`                           | Yes                                                 |
| Rôles et autorisations                 | `GET /access/permissions` (grouped), `GET/POST /access/roles`, `GET/PATCH .../{id}`, `PUT .../permissions`                                   | Yes                                                 |
| Journal d'audit                        | `GET /audit-events` (labels, `targetModule`), `GET /audit-filters` (labelled options)                                                        | Yes                                                 |
| Paramètres                             | `GET /auth/me`, `GET /health/ready`                                                                                                          | Yes; no self-service password change (spec: hidden) |

## Out of Scope

- Any frontend change beyond the generated, unused `types.gen.ts` and its
  script.
- Removal of the `/api` aliases (they stay until the V1 screens are deleted
  in R8 and R9).
- Response `data` schemas per resource: the document types the envelope, the
  page, the statement and the error precisely, and the resource payloads as
  open objects. They are tightened screen by screen as each is rebuilt.
- A `DEP-` reference for expenses and a self-service password change; neither
  is in `BE-25` to `BE-38`.

## Verification

Run locally on macOS, Node 24.15.0:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings
- `npm run typecheck`: passed (backend and frontend, including the generated
  types)
- `npm run test --workspace backend`: 305 passed, 10 skipped (41 files
  passed, 5 skipped; the skipped files are the database-backed suites)
- `npm run openapi:generate` then `npm run openapi:check`: up to date
- `npx @apidevtools/swagger-cli validate backend/openapi.json`: valid
  (82 paths, 113 operations)
- `npm run api:types --workspace frontend`: generated, no diff

Acceptance scenarios:

| ID       | Where                                                                                                                                                                                                          | Result                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| AS-V2-07 | `app.runtime.test.ts` (both prefixes, `Deprecation` header), `access.routes.test.ts` and `customers.routes.test.ts` (matrix on `/api` and `/api/v1`), `openapi.test.ts` (every mounted route has an operation) | Pass locally                         |
| AS-V2-08 | `home.service.test.ts`: without `supplier_balances.view` the `payables` block is `null`, other blocks present; partial receivables                                                                             | Pass locally; p95 on the fixture: CI |
| AS-V2-09 | `references.concurrency.test.ts`: 20 concurrent `VT-` and 20 concurrent `AC-` allocations are distinct and well formed                                                                                         | CI only (needs PostgreSQL)           |

**Not verified locally, by decision (`CI only`):** this machine has no
PostgreSQL or Docker. Read these from the Actions log before merge:

| Item                                                                                                                      | Where |
| ------------------------------------------------------------------------------------------------------------------------- | ----- |
| Migrations `add_document_references`, `inventory_source_type_enum`, `unify_payment_method_enum`, `add_user_version` apply | CI    |
| Reference backfill: existing sales numbered in `postedAt` order, `sales.reference` unique and not null                    | CI    |
| Schema drift guard passes (sequences listed in `protected-objects.json`)                                                  | CI    |
| AS-V2-09 concurrency test                                                                                                 | CI    |
| Performance integration suite still within budget after the schema changes                                                | CI    |
| `Check the OpenAPI document` and `Check the generated API types` steps                                                    | CI    |

### CI evidence

_To be pasted from the Actions run before merge._

## Database and Migration Impact

Four migrations, all additive except the enum consolidation:

- `20260922150000_add_document_references`: two sequences, `sales.reference`
  (backfilled, then `NOT NULL`, unique), `purchases.reference` (unique,
  nullable until posting).
- `20260922151000_inventory_source_type_enum`: `inventory_movements.source_type`
  becomes the enum `InventorySourceType`; the existing text values are the
  enum values.
- `20260922152000_unify_payment_method_enum`: one `PaymentMethod` enum
  replaces the five per-table enums, which are dropped.
- `20260922153000_add_user_version`: `users.version` integer, default 1.

`prisma/protected-objects.json` lists the two sequences so the drift guard
allows them.

## Environment Impact

No new variables. The OpenAPI document is served only when `NODE_ENV` is not
`production`. No real secrets.

## Risks and Follow-Up

- The generated document is large (about 380 KB) because the shared query
  schemas are inlined per operation; harmless for the type generator, worth
  hoisting into `components.schemas` if it is ever served to browsers.
- Resource payloads are open objects in the contract until R8 and R9 add
  per-resource response schemas; the frontend types are exact for requests,
  envelopes, pages, statements and errors.
- `PATCH /access/users/{id}` changes the e-mail without a confirmation step;
  the audit event records the old and new values.
- Expense references (`DEP-`) and a self-service password change are logged as
  follow-ups for the R9 expenses and settings sprints.
- Tag `v1.1.0` on `dev` after merge with `RELEASE_v1.1.0.md`, per the release
  gate.

## Merge Checklist

- [ ] CI passed
- [x] No real `.env` files or secrets committed
- [x] Scope matches the sprint
- [x] Target branch is `dev`

# R4 Sprint 12 Ingredient Cost Simulation

## Branches

- Source: `feature/r4-sprint-12-cost-simulation`
- Target: `dev`

## Scope

Implements Release R4, Sprint 12: ingredient cost simulation. This closes
Release R4.

The module is a planning tool and nothing else. `SIM-003` is the whole design
constraint: a simulation has no inventory, supplier, customer, revenue, payment,
or expense effect. Saving, duplicating, or deleting a scenario writes only to
the two simulation tables.

## Summary

- Added the simulation schema:
  - `cost_simulations`;
  - `cost_simulation_ingredients`.
- Implemented the section 16.3 calculation rules exactly, including unit
  conversion when the entered unit differs from the price basis.
- An ingredient may reference a raw material or be free text, per `SIM-004`.
- Every entered value is snapshotted, so a later raw material rename, unit
  rename, or price change never rewrites a saved scenario, per `SIM-006`.
- Added save, duplicate, rename, update, and delete, per `SIM-005`.
- Added the French simulation workspace with a live client-side estimate that
  is clearly labelled as an estimate.
- Added 21 tests, including the worked example from the source of truth.
- Fixed a shipped UI defect: `--brand-deep` was used three times in the
  stylesheet but never defined, so the selected state on every filter chip and
  list row rendered with no visual feedback. It now uses `--brand-navy`.

## Out of Scope

- Overhead, packaging, energy, labor, selling price, and margin are not
  included, per `SIM-010`. They are an open decision and must not be folded
  invisibly into the ingredient cost.
- Multi-output production cost allocation remains deferred per `SIM-008`.
- Converting a simulation into an operational recipe remains deferred per
  `SIM-009`.
- Version 1 uses one final product and one output quantity per scenario, per
  `SIM-007`.

## Verification

- `npm run prisma:validate`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed; backend 188 tests and frontend 3 tests.
- `npm run build`: passed.
- `npm run format:check`: passed.

## Database and Migration Impact

Adds migration:

- `backend/prisma/migrations/20260922130000_add_cost_simulations/migration.sql`

The migration is purely additive. It creates two tables and touches no existing
table or column. The simulation tables reference products, units, and raw
materials read-only; nothing in the operational domain references them back,
which is what keeps `SIM-003` structurally true rather than merely intended.

Database check constraints enforce the section 16.3 validation rules:

- output quantity is greater than zero, so cost per final product can never
  divide by zero;
- ingredient quantity and base quantity are greater than zero;
- the conversion factor is greater than zero;
- the unit price is not negative;
- stored costs are not negative.

Apply to shared remote development only after review using:

```bash
npm run prisma:migrate:deploy --workspace backend
```

## Environment Impact

No new or changed environment variables.

## API and Permission Surface

- `GET /api/cost-simulations` — requires `simulations.view`.
- `GET /api/cost-simulations/:simulationId` — requires `simulations.view`.
- `POST /api/cost-simulations` — requires `simulations.create`.
- `POST /api/cost-simulations/:simulationId/duplicate` — requires
  `simulations.create`.
- `PATCH /api/cost-simulations/:simulationId` — requires `simulations.update`;
  optimistic versioning.
- `DELETE /api/cost-simulations/:simulationId` — requires `simulations.delete`.

No permission key was added; all four already existed in the baseline namespace.
The tests prove the four are separate authorities: holding create and update
does not permit delete, and holding create does not permit view.

## Requirement Coverage

| Requirement | Coverage                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------- |
| `SIM-001`   | Ingredients, prices, and a final output quantity are entered by the user.                |
| `SIM-002`   | Total ingredient cost and cost per final product are calculated and stored.              |
| `SIM-003`   | No inventory, supplier, customer, revenue, payment, or expense effect; asserted by test. |
| `SIM-004`   | An ingredient references a raw material or carries a free-text name.                     |
| `SIM-005`   | Save, duplicate, rename, update, and delete are implemented behind their permissions.    |
| `SIM-006`   | Names, units, factors, and prices are snapshotted on the line.                           |
| `SIM-007`   | One output quantity and one optional target product per scenario.                        |
| `SIM-008`   | No multi-output allocation.                                                              |
| `SIM-009`   | No conversion into an operational recipe.                                                |
| `SIM-010`   | No overhead, packaging, energy, labor, selling price, or margin.                         |

## Acceptance Evidence

- `AS-018` cost simulation:
  `backend/src/modules/simulation/simulation.service.test.ts`, "calculates the
  documented example and touches nothing operational" reproduces the section
  16.3 worked example exactly. Flour 3 kg at 1.800, yeast 0.1 kg at 9.000, salt
  0.05 kg at 1.000 give line costs of 5.400, 0.900 and 0.050, a total of 6.350
  TND, and 0.127 TND per piece over 50 pieces. The same test asserts the
  inventory, customer ledger, supplier ledger, expense, and sale stores are all
  still empty.
- Unit conversion: "converts to the price basis unit using the raw material
  conversion" costs 2 sacks of flour at 25 kg per sack against a per-kilogram
  price and asserts a base quantity of 50 and a line cost of 90.000.
- Division by zero: "rejects a zero output quantity so cost per product never
  divides by zero".
- `SIM-006` snapshots: "keeps snapshotted values when the raw material price
  basis changes later" renames the raw material and the unit after saving, then
  asserts the stored scenario still reads the original names and price.
- Permission separation:
  `backend/src/modules/simulation/simulation.routes.test.ts`.
- Schema and validation constraints:
  - `backend/prisma/schema.prisma`
  - `backend/prisma/migrations/20260922130000_add_cost_simulations/migration.sql`
- French simulation UI:
  - `frontend/src/features/simulation/SimulationManagement.tsx`
  - `frontend/src/features/simulation/simulationApi.ts`
  - `frontend/src/features/shell/ProtectedShell.tsx`
  - `frontend/src/styles/global.css`

## Decisions Taken

1. **A free-text ingredient may carry an explicit conversion factor.** Section
   16.3 requires a conversion to exist when units differ, but only a raw
   material can declare one. Rather than forbidding differing units on a
   free-text ingredient, the caller may supply the factor. When neither a
   declared conversion nor an explicit factor is available the command is
   refused with `SIMULATION_CONVERSION_REQUIRED`.
2. **A simulation can genuinely be deleted.** Everywhere else a posted record is
   cancelled rather than removed, but `SIM-005` names delete explicitly and
   `SIM-003` means there is no operational history to protect. Deletion is
   still audited.
3. **Results are stored, not recomputed on read.** The total and the cost per
   final product are written alongside the snapshotted inputs, so a saved
   scenario always reads back exactly as it was calculated, which is what
   `SIM-006` asks for.

## Risks and Follow-Up

- Manual responsive review is still outstanding at 360 px, 430 px, 768 px, and
  desktop widths. The ingredient form is the longest in the application and is
  the most likely to need attention on a phone.
- The workspace supports create, duplicate and delete but not editing an
  existing scenario in place; the `PATCH` endpoint exists and is tested, so this
  is a UI gap rather than a missing capability.
- The client-side estimate duplicates the server formula. It is labelled as an
  estimate and the server value is what gets stored, but the two could drift if
  the rules change; only the server copy is authoritative.

## Merge Order

This branch was cut from `dev` at PR #17, before Sprint 11 was merged. Sprint 11
and this branch both touch `schema.prisma`, `app.ts`, `server.ts`,
`ProtectedShell.tsx`, and `global.css`, so whichever merges second will need
`dev` merged into it first. The changes are additive and in different regions of
each file.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches the sprint
- [ ] Target branch is `dev`

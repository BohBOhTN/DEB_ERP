# R1 Sprint 3 Catalog and Units

## Branches

- Source: `feature/r1-sprint-3-catalog-units`
- Target: `dev`

## Scope

Implements the Release R1, Sprint 3 catalog foundation for units, product categories, raw materials, and products.

This PR adds additive master-data persistence, permission-protected catalog APIs, default unit seeding, optimistic version checks for products and raw materials, French responsive catalog management screens, and focused allowed/denied route tests.

## Atomic Commits

- `feat(catalog): add master data schema`
- `refactor(access): share permission middleware`
- `feat(catalog): add units and category APIs`
- `feat(catalog): add raw material and product APIs`
- `feat(catalog): add catalog management workspace`

## Summary

- Added `Unit`, `ProductCategory`, `Product`, `RawMaterial`, and `RawMaterialUnitConversion` Prisma models.
- Added an additive catalog migration with positive conversion checks, nonnegative product price checks, active-name uniqueness, and reference constraints.
- Added default unit seeding for piece, kilogram, gram, litre, millilitre, tray, box, and bag.
- Added protected `/api/catalog` endpoints for units, categories, products, raw materials, product activation, raw-material activation, and raw-material conversions.
- Added server-side pagination and search for catalog lists.
- Added active reference validation for product category, product unit, raw-material base unit, and conversion units.
- Added optimistic version checks for product and raw-material updates/activation/conversion changes.
- Added audit writes for catalog create/update/activation/deactivation and conversion changes.
- Added French catalog workspace with guarded navigation, creation forms, list states, and activation controls.
- Added backend route tests for anonymous rejection, denied access, allowed units listing, category creation, product listing, and raw-material creation.

## Out of Scope

- Inventory movements, opening stock, and stock adjustments.
- Supplier purchase workflows.
- POS sale workflows.
- Product recipe or production behavior.
- Bulk import/export.
- Legal invoice or barcode hardware integration.

## Verification

- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed with local-port permission for Supertest.
- `npm run build`: passed.
- `npm run prisma:validate`: passed.

## Database and Migration Impact

Adds migration:

- `backend/prisma/migrations/20260921033000_add_catalog_master_data/migration.sql`

New tables:

- `units`
- `product_categories`
- `products`
- `raw_materials`
- `raw_material_unit_conversions`

Startup seed impact:

- Upserts default units idempotently.

No destructive schema changes are included.

## Permission Impact

Uses existing Sprint 2 permission keys:

- `units.view`
- `units.manage`
- `categories.view`
- `categories.manage`
- `products.view`
- `products.create`
- `products.update`
- `products.activate`
- `raw_materials.view`
- `raw_materials.create`
- `raw_materials.update`
- `raw_materials.activate`

## Requirement Mapping

- MST-001: product categories can be created, renamed, activated, and deactivated through guarded API support.
- MST-002: categories are deactivated rather than deleted.
- MST-003: active category names are normalized and unique.
- MST-004: finished products can be managed through guarded API/UI support.
- MST-005: products reference one product category.
- MST-006: products include name, base selling unit, selling price, active status, and stockable flag.
- MST-007: deactivation preserves historical product records.
- MST-009: raw materials can be managed through guarded API/UI support.
- MST-010: raw materials reference a base unit.
- MST-011: raw materials support purchase-unit conversions.
- MST-013: default units are seeded.
- MST-014: conversion data supports package-to-base normalization.
- MST-015: conversion factors must be positive and non-zero.
- UX-001 through UX-004: UI copy is French and API errors remain structured.
- UX-008 through UX-015: catalog workspace is responsive and includes loading, empty, error, and permission-aware states.

## Merge Checklist

- [ ] CI passed on GitHub.
- [ ] Migration reviewed before applying to any shared database.
- [ ] One person owns migration deployment to the shared development database.
- [ ] No real `.env` files or secrets committed.
- [ ] Scope remains limited to R1 Sprint 3.
- [ ] Target branch is `dev`.

## GitHub PR Link

Use this compare URL:

```text
https://github.com/BohBOhTN/DEB_ERP/compare/dev...feature/r1-sprint-3-catalog-units?expand=1
```

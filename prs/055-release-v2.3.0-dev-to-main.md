# Release v2.3.0 Promotion of `dev` to `main`

## Branches

- Source: `release/v2.3.0` (`dev` plus the release cut)
- Target: `main`

## Scope

Promotes release 2.3.0 to the releasable branch: the shopping trip and the
sub-categories of expenses of issue 018 (PRs #80 and #81), plus the
release cut (version, changelog, `RELEASE_v2.3.0.md`). Issues 015, 016 and
017, listed under 2.3.0 in the changelog, are already on `main` and in
production.

## Behaviour added since `main`

| Area     | Capability                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Achats   | `Nouvelle course` (`/achats/course`): the store, the raw materials and the other goods on one page, one validation, one confirmation of its effects |
| Achats   | The raw materials become a posted purchase (stock, supplier account, payment at posting); the other goods become expenses posted on the spot        |
| Achats   | The purchase page lists the other goods of its trip with their total and a link to the expense list narrowed to that trip                           |
| Accueil  | `Course fournisseur` in the quick actions, for a role that may create and post a purchase and create an expense                                     |
| Dépenses | Sub-categories: `Catégorie parente` in the category form, the tree on the categories page, the path ("Fournitures › Emballage") in every picker     |
| Dépenses | An expense of a trip names its store and links its purchase; `Course fournisseur` in the page header                                                |
| API      | `POST /procurement/shopping-trips`; `parentId`, `depth` and `path` on categories; `purchaseId` and `supplierId` filters on `GET /expenses`          |

## Database and migration impact

One additive migration,
`20261006100000_expense_sub_categories_and_shopping_trips`: three nullable
columns (`expense_categories.parent_id`, `expenses.supplier_id`,
`expenses.purchase_id`), three indexes, three foreign keys. No backfill,
no rewrite of existing rows. The deploy applies it to the production
database before the new API starts.

## Environment impact

None: no new setting, secret, dependency, volume or permission.

## Verification

CI ran on pull request #81 and passed every step, including the migration
on the CI database, the drift check, the PostgreSQL suites, both builds,
the browser suite and the container images. Local results are in
`RELEASE_v2.3.0.md`. Issue 018 was not tried on the test environment: it
was merged to `dev`, not to `staging`. The push to `main` runs CI again
and pauses the deploy job on `production` for the owner's approval:
**merging this pull request and approving that job applies the migration
and deploys 2.3.0 on the production database.**

## Rollback considerations

- **Code**: a manual deploy run with the previous image tag
  (`3e861e89…`, the build `main` runs today) puts the previous release
  back.
- **Data**: the three columns can stay; the previous release ignores
  them. Purchases and expenses recorded by a trip remain ordinary posted
  documents under the previous release, which shows the expenses without
  their store. A sub-category shows as a plain category.

## Tagging

Per DEC-V2-001, `v2.3.0` is tagged on `dev` after the deploy is checked.
This pull request does not tag.

## Merge Checklist

- [ ] CI passed on this pull request
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches release 2.3.0
- [ ] Target branch is `main`
- [ ] Deploy approved and `/api/health/ready` reports `2.3.0` with the merged commit
- [ ] A shopping trip validated by the owner on production; `Catégories` shows the tree

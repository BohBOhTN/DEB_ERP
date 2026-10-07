# Release v2.5.0 Promotion of `dev` to `main`

## Branches

- Source: `release/v2.5.0` (`dev` merged with `main`, plus the release cut)
- Target: `main`

## Scope

Promotes release 2.5.0 to the releasable branch: issue 024 (PR #92),
tried on the test environment through PR #93 and approved by the owner,
plus the release cut (version, changelog, `RELEASE_v2.5.0.md`). The
branch also carries `main` back into the line: the four 2.4.0 release
commits that had never returned to `dev`, so the version, the changelog
and the evidence files line up on both branches after this merge.

## Behaviour added since `main`

| Area      | Capability                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue | `Étiquettes de prix` (`/produits/etiquettes`, entry `Étiquettes`, button on `Produits`): pick products by search, category and origin; copies per product           |
| Catalogue | Tag format: `Petite` 50 × 30, `Moyenne` 70 × 40, `Grande` 100 × 60 mm, or a free size within the printable area; tags per sheet and share of the sheet shown        |
| Catalogue | A4 sheets packed from the top-left corner without gaps, the leftover strips filled with turned tags, the waste at the right and the bottom; `Imprimer` prints A4    |
| Catalogue | The tag: logo in a gold ring with the bakery's name, a gold ornament, the product's name centred in the serif, the price in a navy band, inside a double gold frame |

## Database and migration impact

None. The deploy's `migrate deploy` step finds nothing to apply.

## Environment impact

None: no new setting, secret, dependency, volume or permission.

## Verification

CI passed on the pull request of the issue (run 37700693546), on `dev`
(run 37701716317) and on the push to `staging` (run 37702112660): the
PostgreSQL suites, the drift check, both builds, the browser suite and
the container images. The owner tried the page on
`testing.darelbarka.work`, asked for the tag to be reworked, and
approved the result. Local results are in `RELEASE_v2.5.0.md`. The push
to `main` runs CI again and pauses the deploy job on `production` for
the owner's approval: **merging this pull request and approving that job
deploys 2.5.0; no migration runs.**

## Rollback considerations

- **Code**: a manual deploy run with the previous image tag (the build
  of `397d2b9`, the 2.4.0 merge on `main`) puts 2.4.0 back.
- **Data**: nothing to undo; the release writes nothing new.

## Tagging

Per DEC-V2-001, `v2.5.0` is tagged on `dev` after the deploy is checked.
This pull request does not tag.

## Merge Checklist

- [ ] CI passed on this pull request
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches release 2.5.0
- [ ] Target branch is `main`
- [ ] Deploy approved and `/api/health/ready` reports `2.5.0` with the merged commit
- [ ] A sheet of tags printed by the owner from production

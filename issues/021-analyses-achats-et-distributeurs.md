# 021 · Analyses: the purchases (raw materials and resold products) and the distributors

| Field            | Value                                                                             |
| ---------------- | --------------------------------------------------------------------------------- |
| Module           | `backend/src/modules/analytics`, `frontend/src/features/analytics`                |
| Type             | Feature                                                                           |
| Priority         | High                                                                              |
| Depends on       | 019 (the kind of a purchase line), 014 (the analytics module)                     |
| Suggested branch | `feat/021-analyses-achats-distributeurs`                                          |
| Related          | `DEC-V2-006` (read-only analyses on the recorded history), issue 014's next steps |

## Owner's request

> On `Analyses`, add analyses for the purchases, so we have an idea of what we buy in raw materials and in resold products. And an analysis for the distributors: we have no view of that sales channel.

## Findings

- `Analyses` has four tabs, all about selling ([analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts): overview, frequency, products, customers). Nothing reads `purchases` or `purchase_lines`.
- The distributors appear once, as one figure: the `distributorsTnd` share of the revenue. Who sells, what, how much comes back from consignment and who owes what are in the documents (`distributor_sales`, `distributor_settlements`, their lines with `returned_quantity` and the cost snapshot, `distributor_ledger_entries`) and are never aggregated.
- Issue 014 listed both as next steps ("distributor sell-through and returns per distributor and product, raw-material purchase prices over time").

## Proposed change

### Backend, read-only, SQL aggregates, Tunis days, posted documents only

1. `GET /analytics/purchases` (`analytics.view` and `purchases.view`). Over purchases posted and not cancelled, by purchase date:
   - totals against the previous period: all purchases, raw materials, resold products, the number of purchases, what is still due on them;
   - a trend per bucket, split in two kinds;
   - the suppliers ranked by amount, with their share and the split;
   - the raw materials bought: quantity in base unit, amount, average and last price per base unit, the change of price inside the period;
   - the resold products bought: quantity, amount, average and last purchase price, and the quantity sold over the same period on the three channels, so bought and sold read side by side.
2. `GET /analytics/distributors` (`analytics.view` and `distributors.view`):
   - revenue of the channel against the previous period, split between direct sales and consignment settlements, the number of documents, the distributors active in the period;
   - a trend per bucket, split the same way;
   - per distributor: revenue, split, documents, share, quantities sold and returned from consignment with the return rate, last activity; the current balance with `distribution.balances.view`;
   - the products sold through distributors: quantity, revenue, returns and return rate; the approximate margin on costed lines with `margin.view`.

### Frontend

- Two tabs after `Clients`: `Achats` and `Distributeurs`, each offered with its second permission, in the URL like the others, with the loading, empty and error states of the module.
- `Achats`: four tiles, the trend with two series, suppliers as bars, two tables (raw materials, resold products).
- `Distributeurs`: four tiles, the trend with two series, distributors as bars and a table, the products table.

## Tests

- Backend: shaping on doubles (kinds, comparison window, zero-filled buckets, blocks left out without their permission, return rate, price change); the routes (401, 403 without each permission, 400 on a bad period); a database-backed test on a dated history for the raw SQL; the performance suite with the two reads.
- Frontend: each tab with MSW (figures, hidden blocks, empty period, error), the tabs not offered without their permission, the page at 360 px.
- Browser: both tabs at the three widths, axe.

## Acceptance criteria

- `Achats` answers: how much did we buy this month, how much of it in raw materials and in resold products, from whom, at what price, and how much of the resold goods was sold.
- `Distributeurs` answers: what does the channel bring, who sells the most, what comes back, who owes.

## Decisions surfaced

- `DEC-V2-011` (new): the analyses of `DEC-V2-006` extend to purchases and to the distributor channel, read-only, each behind `analytics.view` and the permission of the module it reads.
- A purchase is counted on its purchase date for its full amount, paid or not; a cancelled purchase is left out.

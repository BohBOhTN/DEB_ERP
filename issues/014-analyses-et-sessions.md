# 014 · Analyses: an analytics module on the data already collected, and the till sessions made findable

| Field            | Value                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Module           | new `backend/src/modules/analytics`, new `frontend/src/features/analytics`, `backend/src/modules/pos`, `frontend/src/features/pos`, `frontend/src/components/patterns`, `frontend/src/app/nav`         |
| Type             | Feature                                                                                                                                                                                                |
| Priority         | High                                                                                                                                                                                                   |
| Depends on       | 008 (cost snapshots on sold lines, `margin.view`), 001 (shared period filter)                                                                                                                          |
| Suggested branch | `feat/analytics-module`                                                                                                                                                                                |
| Related          | source of truth §1 ("advanced dashboards" deferred), `OD-V2-001` (operational home only), `DEC-V2-005` (approximate margin), V2 `AGENTS.md` §6, `03_AEGIS_REFERENCE_BLUEPRINT.md` §3 (reports removed) |

## Owner's request

> A new module, analytics, built on the aggregated data the application already collects: charts that show the benefits and insights about the business, like the frequency of sales and orders seen on Aegis. And a section that lists the till sessions, with the information and the details of each one.

## Findings

### Nothing analyses the history today, by decision

- The source of truth defers "advanced dashboards, profitability, and scheduled daily reports" (§1, line 167) and `OD-V2-001` keeps `Accueil` "operational only" ([11_DECISION_LOG_V2.md](../internal-docs/DAR_EL_BARKA_V2_REDESIGN_AND_HARDENING_PACK/docs/11_DECISION_LOG_V2.md)); the V2 `AGENTS.md` §6 lists "advanced analytics" as deferred and the Aegis blueprint classifies `pages/reports/*` as REMOVE. The owner's request lifts that deferral, so it is logged as `DEC-V2-006` and the source of truth is marked for update. `Accueil` itself stays operational: the analyses live on their own page.
- `Accueil` reads one business day ([home.service.ts:42](../backend/src/modules/home/home.service.ts#L42)); no endpoint answers "over this month" for sales, products or customers. The only range aggregates are the list KPI rows (`/pos/sales/summary`) and the expense totals ([expenses.service.ts:197](../backend/src/modules/expenses/expenses.service.ts#L197)).

### The data is already there

| Question the owner asks                     | Rows that answer it                                                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How much did we sell, through which channel | `sales` (posted, `sold_at`, linked order or not), `distributor_sales`, `distributor_settlements`                                                                                                                                      |
| When do customers buy                       | `sales.sold_at`, stored as UTC `TIMESTAMP(3)`; day and hour must be read in `Africa/Tunis`                                                                                                                                            |
| When are orders due                         | `customer_orders.requested_fulfillment_at`, status                                                                                                                                                                                    |
| What sells, what does not                   | `sale_lines`, `distributor_sale_lines`, `distributor_settlement_lines` (sold quantity); till lines are always in the product's base unit ([pos.service.ts:905](../backend/src/modules/pos/pos.service.ts#L905)), so quantities add up |
| What it earns, approximately                | `unit_cost_tnd` snapshots on sold lines (issue 008), till lines only (`DEC-V2-005`)                                                                                                                                                   |
| Who buys, who stopped                       | `sales.customer_id`, first and last purchase per customer                                                                                                                                                                             |
| What we spend                               | `expenses` (posted), by category                                                                                                                                                                                                      |
| How each till session went                  | `pos_sessions`, their sales, payments, advances and règlements                                                                                                                                                                        |

Every figure can be a SQL aggregate over indexed columns (`sales(status, sold_at)`, `sales(customer_id, status, sold_at)`, `sales(session_id, posted_at)`, `expenses(status, expense_date)`); no new table and no migration are needed.

### The chart kit is half there

- `BarChart`, `RankedList`, `Sparkline`, `KpiTile` and `KpiGrid` exist ([components/patterns](../frontend/src/components/patterns)); a heat map (day × hour) and a trend chart with a comparison series do not.
- No chart library is installed and the initial bundle is budgeted at 250 kB gzip ([check-bundle-size.mjs](../frontend/scripts/check-bundle-size.mjs)). The two missing charts are small enough to be hand-rolled SVG on the chart tokens, like `BarChart`, and the page is a lazy route chunk.
- `PeriodFilter` offers today, yesterday, this week, this month and a custom range ([periodRange.ts](../frontend/src/lib/dates/periodRange.ts)): right for a list, too short for a trend. The analyses need 30 days, 90 days and the year.

### Sessions: the page exists and nobody can find it

- `/caisse/sessions` and `/caisse/sessions/:id` are built (`UI-15`, `BE-30`) but no navigation item leads to them: the list is only an alias of the `Caisse` item ([nav.ts:73](../frontend/src/app/nav.ts#L73)), and the only links are the redirect after closing the till ([CaissePage.tsx:326](../frontend/src/features/pos/pages/CaissePage.tsx#L326)) and a line on a sale's page. This is why the owner asks for "a section that lists the sessions".
- The list opens on "Aujourd'hui" ([SessionsPage.tsx:23](../frontend/src/features/pos/pages/SessionsPage.tsx#L23)): one row on a normal day, none before the till opens. A history should open on the month.
- No KPI row: the owner cannot read how many sessions, how much they sold, or the cumulated cash difference of a period without adding rows up.
- The detail has the drawer figures only ([SessionDetailPage.tsx](../frontend/src/features/pos/pages/SessionDetailPage.tsx)): no duration, no average basket, no activity by hour, no top products, no count of cancelled sales.
- "Crédit accordé" on the detail is the sum of `remainingDueTnd` ([pos.service.ts:1206](../backend/src/modules/pos/pos.service.ts#L1206)), a projection that shrinks with every later règlement (issue 007): the label promises what was granted at the till and shows what is still owed today. The figure is right for "Reste à encaisser"; the label is wrong.

## Proposed change

### Backend: `modules/analytics`, read-only, SQL only

One permission, `analytics.view` ("Analyses", "Voir les analyses"), guards the module. A block that belongs to another permission appears only when the caller also holds it, as on `Accueil`: expenses need `expenses.view`, the margin needs `margin.view`, the order frequency needs `orders.view`, the customer analysis needs `customers.view`.

Every endpoint takes `from` and `to` as business days (`YYYY-MM-DD`, Tunis), defaults to the last 30 days, refuses a reversed range and more than 366 days, and reads posted documents only (a cancelled sale never counts).

| Endpoint                   | Answer                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /analytics/overview`  | revenue (total, by channel: comptoir, commandes, distributeurs), number of till sales, average basket, still due, each with the same figure over the previous period of equal length; expenses with their categories; approximate margin; a trend per day (per month above 92 days) with the previous period aligned; the best day |
| `GET /analytics/frequency` | sales by weekday × hour in Tunis (count and amount), totals by weekday with the average per occurrence of that weekday in the range, totals by hour, the busiest slot; the same for orders by requested pickup time                                                                                                                |
| `GET /analytics/products`  | per product over every channel: quantity, number of documents (how often it sells), revenue, last sale, approximate margin on costed till lines; revenue by category; active products with no sale in the range                                                                                                                    |
| `GET /analytics/customers` | identified against anonymous sales, active, new (first purchase ever in the range) and returning customers (two purchases or more), the ten best customers, and the customers to win back (no purchase for 60 days, ranked by lifetime revenue)                                                                                    |

The approximate-margin query of `Accueil` moves to `shared/marginFigures.ts` and both services use it.

### Backend: sessions

- `GET /pos/sessions/summary` (same filters as the list): sessions, open and closed, sales count and total, cumulated difference, shortage and surplus, sessions with a difference.
- `GET /pos/sessions/:id` gains `insights`: average basket, cancelled sales, sales by hour, the five best products.

### Frontend

1. **Patterns** (component spec, example, test): `Heatmap` (weekday × hour grid, five intensity levels from the chart tokens, each cell a labelled button, a text readout) and `TrendChart` (SVG line and area with an optional dashed comparison series and a readable summary).
2. **Period**: `PeriodFilter` accepts a `presets` list; `periodRange` gains `last30`, `last90` and `year`; `previousRange` gives the comparison window.
3. **`/analyses`** (`analytics.view`, lazy chunk), state in the URL: period control, tabs `Vue d'ensemble`, `Fréquence`, `Produits`, `Clients` (the last one with `customers.view`). Each tab has loading, empty and error states and explains its figures in French.
4. **Sessions**: a `Sessions de caisse` navigation item; the list opens on the month with a KPI row; the detail shows duration, average basket, activity by hour and top products; "Crédit accordé" becomes "Reste à encaisser".
5. **Cache**: an `analytics` root on the `list` tier, refreshed by the events that change its figures (sales, orders, distributor documents, expenses, product and customer records).

## Tests

- Backend unit (prisma doubles): period resolution and previous window, zero-filled buckets, month granularity, channel split, permission-scoped blocks, weekday averages, busiest slot, product shares and margin hiding, customer segments.
- Backend routes: 403 without `analytics.view`, 403 on customers without `customers.view`, 400 on a reversed or too long range, the envelope of each endpoint; sessions summary.
- Backend integration (PostgreSQL, CI only): the raw SQL on real rows dated in an isolated past month: Tunis hour and weekday of a sale posted late in the UTC evening, cancelled sales excluded, channel totals, product documents count, new and returning customers. The four reads join the latency budget of the performance suite.
- Frontend: `Heatmap`, `TrendChart`, `periodRange`; the page per tab with MSW (figures, hidden blocks without permission, empty period, error), no horizontal scroll at 360 px; sessions list KPIs and detail insights; navigation manifest.
- Browser: `/analyses` in the axe run and the shell smoke.

## Acceptance criteria

- The owner opens `Analyses` from the navigation, picks a period and reads revenue, sales count, average basket and expenses against the previous period, with a trend chart.
- `Fréquence` shows when the bakery sells (weekday × hour) and when orders are due, and names the busiest slot.
- `Produits` ranks what sells, how often, what it earns approximately (with `margin.view`), and lists what did not sell.
- `Clients` shows who buys the most and who stopped buying.
- A user without `analytics.view` neither sees the item nor gets the data (403); margin, expenses and customers stay behind their own permissions.
- `Sessions de caisse` is in the navigation; the list opens on the month with totals; a session page tells its duration, average basket, busiest hours and best products.
- Every figure is computed by the database, in Tunis time, on posted documents only.

## Decisions surfaced

- `DEC-V2-006` (new): the analytics module is accepted scope, read-only, behind `analytics.view`; `Accueil` stays operational (`OD-V2-001` unchanged).
- `DEC-V2-005` (kept): the margin stays approximate, on costed till lines, and says what share of the revenue it covers; distributor documents are not in the margin.
- Left for a later step, on the owner's word: distributor analysis (sell-through and returns per distributor and per product), purchase prices of raw materials over time, an export of the tables, a separate permission for the sessions history (today `pos.access`).

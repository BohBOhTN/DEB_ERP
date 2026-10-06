# 022 · KPIs: `Total charges` on Accueil, and the five figures of `Vue d'ensemble`

| Field            | Value                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Module           | `backend/src/modules/home`, `backend/src/modules/analytics`, `frontend/src/features/home`, `…/analytics`    |
| Type             | Change                                                                                                      |
| Priority         | High                                                                                                        |
| Depends on       | 019 (the kind of a purchase line), 021 (the purchase figures by kind)                                       |
| Suggested branch | `feat/022-kpi-total-charges`                                                                                |
| Related          | `OD-V2-001` (Accueil is operational), issue 002 and #66 (the Accueil tiles), issue 014 (the overview tiles) |

## Owner's request

> On the home page, replace `Encaissé en espèces` with the total of the charges, named `Total charges`: the expenses of the day plus the purchases of raw materials. On `Vue d'ensemble`, the KPIs become: `Chiffre d'affaires` with the number of sales in it (the sales count no longer needs a tile of its own), `Total charges` as on the home page, `Marge approximative`, `Total achats matières premières`, `Total achats produits de revente`.

## Findings

- Row 1 of `Accueil` shows, when the permissions allow: sales of the day, `Encaissé en espèces`, expenses of the day, approximate margin, customer receivables, supplier payables ([KpiRow.tsx](../frontend/src/features/home/widgets/KpiRow.tsx)). The cash figure comes from `sales.today.cashTnd` ([home.service.ts](../backend/src/modules/home/home.service.ts)); the open session card and the session pages show the drawer's cash too.
- Nothing on `Accueil` or in the overview adds purchases to expenses: the owner reads what he spent in two places and sums it himself.
- `Vue d'ensemble` shows six tiles: revenue, till sales, average basket, still due, expenses, approximate margin ([OverviewTab.tsx](../frontend/src/features/analytics/tabs/OverviewTab.tsx)).

## Proposed change

- **Definition** (`DEC-V2-012`): `Total charges` of a day or a period = posted expenses + raw-material lines of posted purchases, each on its own date (expense date, purchase date), for its full amount whether paid or not. The purchases of resold products are not charges: they are goods in stock, shown on their own. The other goods of a shopping trip are expenses and are counted once, as expenses.
- **Accueil**: the summary gains a `charges` block (with `expenses.view` and `purchases.view`): total, expenses, raw-material purchases, the day before. The tile `Total charges` takes the place of `Encaissé en espèces`, with "Dépenses X · Matières premières Y" under it and the comparison with the day before. `Dépenses du jour` stays beside it.
- **Vue d'ensemble**: five tiles, each against the previous period: `Chiffre d'affaires` (with "N ventes" under it), `Total charges`, `Marge approximative`, `Achats matières premières`, `Achats produits de revente`. The overview gains `charges` and `purchases` blocks under the same permissions. The trend, the channels and the expenses by category stay.

## Tests

- Backend: the charges of a day on a double (expenses, raw-material lines only, cancelled documents out, the day before, the block absent without either permission); the overview blocks and their comparison window; a database-backed check of the SQL.
- Frontend: the tile on `Accueil` (figures, note, hidden without the permissions, `Encaissé en espèces` gone); the five tiles of the overview and the tiles hidden without their permission.
- Browser: `Accueil` and the overview at the three widths.

## Acceptance criteria

- On a day with 85 TND of expenses, 120 TND of flour and 60 TND of bottles to resell, `Accueil` reads `Total charges` 205 TND; the overview of that day reads charges 205, raw materials 120, resold products 60.

## Decisions surfaced

- `DEC-V2-012` (new): the definition above. The drawer's cash of the day leaves `Accueil`; it remains on the session card and the session pages.
- The average basket and the till's still-due figure leave the overview tiles; both remain in the API and on `Sessions de caisse`.

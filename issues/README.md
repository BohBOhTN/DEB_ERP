# Issues

Owner-reported problems and the findings of the code investigation that followed, grouped by module so that one branch and one pull request can close one file. Each file states the owner's request, what the code does today (with file references), the proposed change split into PR-sized steps, the tests to add or update, the acceptance criteria and the open decisions that must be surfaced before code changes (`AGENTS.md` §2.6).

Workflow: branch `fix/<topic>` or `feat/<topic>` from `dev`, name the issue number in the PR brief under `prs/`, merge into `dev`. Re-read the documentation pack before starting each one.

| #                                                | Title                                                                                   | Priority | Depends on     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- | -------- | -------------- |
| [001](001-shared-period-filter-and-kpis.md)      | Shared period filter and list KPIs (cross-cutting)                                      | High     | —              |
| [002](002-accueil-kpi-periods.md)                | Accueil: "Dépenses du jour" and KPI periods                                             | Medium   | 001 (optional) |
| [003](003-caisse-selection-and-flow.md)          | Caisse: card selection, stay on the till, drop the payment mode                         | High     | —              |
| [004](004-ventes-kpis-filters-cancel-payment.md) | Ventes: KPIs, filters, search, cancel a sale, pay the remainder                         | High     | 001, 007       |
| [005](005-commandes-kpis-filters-actions.md)     | Commandes: KPIs, filters, row actions, deposit and completion fixes                     | High     | 001            |
| [006](006-clients-kpis-delete-detail.md)         | Clients: KPIs, deactivate action, detail gaps                                           | Medium   | 007            |
| [007](007-reglements-lies-aux-documents.md)      | Règlements tied to documents (clients, fournisseurs, distributeurs)                     | Highest  | —              |
| [008](008-produits-cout-approximatif-marge.md)   | Produits: approximate cost per product, approximate margin on Accueil                   | Medium   | 002, 004       |
| [009](009-lignes-cache-et-saisie-des-prix.md)    | Line editors: cached pickers, editable and total-based prices, direct-sale quick action | Medium   | 008            |
| [010](010-deploiement-vps-github-actions.md)     | Deployment: build, ship and run the release on the VPS from GitHub Actions              | High     | main promoted  |
| [011](011-produits-photos-caisse.md)             | Produits: photos on the products, shown on the till tiles                               | High     | 010            |
| [012](012-commandes-acomptes-et-reste.md)        | Commandes: deposits and the remainder shown in the dialogs                              | High     | —              |
| [013](013-retouches-apres-demo.md)               | After the demo: Accueil, product page, customers refresh, stock pickers                 | Medium   | —              |
| [014](014-analyses-et-sessions.md)               | Analyses: an analytics module on the collected data, till sessions made findable        | High     | 008, 001       |
| [015](015-commandes-file-visible.md)             | Commandes: the queue hidden by its default filters, forward-looking periods             | High     | 005, 001       |
| [016](016-achats-validation-et-annulations.md)   | Achats: form validation, one line per material, payments of a cancelled purchase        | Highest  | 007            |

Suggested order: 007 → 003 → 001 → 005 → 004 → 006 → 002 → 008. After the client demo of 2026-09-26: 012 → 013 → 011. Requested on 2026-10-04: 014 (the first feature that lifts a deferred scope, see `DEC-V2-006`). Issues 003, 005 (PR 1) and 002 are independent and can be picked up any time; 008 was added after the first seven were fixed.

Bugs found that the owner did not report, by severity:

1. Completing an order with the amount left empty records it as fully paid (005).
2. Every sale and distributor document keeps its posting-time paid state forever; later payments never update it (007).
3. Partial allocations are allowed by the dialogs and refused by the server in all three payment modules (007).
4. A cashier without `pos.credit_sale` cannot post even a fully paid sale (003).
5. The "Aujourd'hui" and "À venir" order tabs return the same rows on the real backend (005).
6. "Reste" is wrong for completed and cancelled orders (005).
7. Concurrent payments can overpay a party balance (007).
8. "Dépenses du mois" ignores the selected period and computes the month in UTC (002).
9. Enter on any focused till button adds the first product instead (003).
10. Customer ledger labels do not match the backend enum, so règlements render as "payment" (006).
11. Cancelling a purchase then one of its payments (or the reverse) reverses the payment twice and leaves a false supplier balance (016).
12. The till sessions history has no navigation entry, and "Crédit accordé" on a session shows what is still owed today, not what was granted (014).

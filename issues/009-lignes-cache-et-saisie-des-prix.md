# 009 · Line editors: cached pickers, editable and total-based prices, a direct-sale quick action

| Field            | Value                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Module           | `frontend/src/components/patterns/LineEditor`, `frontend/src/features/distribution`, `frontend/src/features/procurement`, `frontend/src/features/simulation`, `frontend/src/features/home`, `backend/src/modules/distribution` |
| Type             | Fixes + small features                                                                                                                                                                                                         |
| Priority         | Medium                                                                                                                                                                                                                         |
| Depends on       | 008 (the product cost that bounds the direct-sale price)                                                                                                                                                                       |
| GitHub issue     | #49                                                                                                                                                                                                                            |
| Suggested branch | `fix/49-line-editors-caching-price-entry`                                                                                                                                                                                      |
| Related          | `UI-26` (one cache policy), `DST-009` (prices snapshotted per line), `OD-006` (distributor price entered per transaction), spec §4.3 and §4.5                                                                                  |

## Owner's request

> Add to Accueil a quick action for the distributor direct sale. On the direct-sale modal, each product selection calls the API; I want good caching of products and ingredients, the same on the simulation and the purchase page. On the direct sale the unit price is fixed from the product price; make it editable (never below the product cost) and let the user type a line total instead, deriving the unit price from the quantity. Same total-based entry on the new purchase, and cache raw materials there too.

## Findings

### Every picker opening is a request

- `Combobox` calls `loadOptions` once on open with the empty query and after every 250 ms debounce ([Combobox.tsx:78](../frontend/src/components/ui/Combobox/Combobox.tsx#L78)); it keeps nothing between openings.
- None of the line pickers caches: `OrderLineEditor` calls `/pos/products` ([OrderLineEditor.tsx:32](../frontend/src/features/orders/components/OrderLineEditor.tsx#L32)), `PurchaseLineEditor` calls `/catalog/raw-materials` ([PurchaseLineEditor.tsx:84](../frontend/src/features/procurement/components/PurchaseLineEditor.tsx#L84)), `ItemCombobox` (simulation ingredients, stock movements) calls both catalogue lists ([ItemCombobox.tsx:61](../frontend/src/features/inventory/components/ItemCombobox.tsx#L61)), and the simulation's target product picker calls `/catalog/products` ([SimulationEditorPage.tsx:54](../frontend/src/features/simulation/pages/SimulationEditorPage.tsx#L54)). Adding a line and opening its picker is one request per line, per opening, per keystroke.
- The Sprint 28 cache policy already has a `reference` tier read once per session and refreshed by its own mutation ([cachePolicy.ts](../frontend/src/lib/query/cachePolicy.ts)), and the invalidation map already names the roots a product or raw-material write refreshes ([invalidation.ts:74](../frontend/src/lib/query/invalidation.ts#L74)). The pickers bypass both because they call the API functions directly instead of the query client.

### Direct-sale prices

- `DirectSaleDialog` reuses `OrderLineEditor`, which fixes `priceEditable={false}` since issue #45 because the server prices order lines from the catalogue ([OrderLineEditor.tsx:81](../frontend/src/features/orders/components/OrderLineEditor.tsx#L81)). The direct sale is the opposite case: the backend snapshots the price sent per line (`DST-009`, `OD-006`, [distribution.service.ts:1683](../backend/src/modules/distribution/distribution.service.ts#L1683)), so the dialog silently sends the catalogue price every time.
- Nothing bounds that price. With issue #48 the product has an approximate cost; a direct sale below it is a loss the owner asked to prevent.
- The direct-sale picker reads `/pos/products`, which never carries the cost; the catalogue list does (with `margin.view`).

### Total-based entry

- `LineEditor` shows the line total as text computed from quantity × unit price ([LineEditor.tsx:233](../frontend/src/components/patterns/LineEditor/LineEditor.tsx#L233)); there is no way to type the total. Purchases price per base unit while the quantity is entered in another unit ([PurchaseLineEditor.tsx:170](../frontend/src/features/procurement/components/PurchaseLineEditor.tsx#L170)), so a derived unit price must divide by the base quantity, not the entered one.
- A unit price is kept to three decimals, so a typed total is not always reproduced exactly (10,000 over 3 pieces gives 3,333 and a stored total of 9,999). The document must show what will be stored.

### Accueil

- Quick actions cover the till, orders, purchases, expenses and customers only ([QuickActionsCard.tsx:33](../frontend/src/features/home/widgets/QuickActionsCard.tsx#L33)). The direct sale opens from a distributor's page only ([DistributorDetailPage.tsx:202](../frontend/src/features/distribution/pages/DistributorDetailPage.tsx#L202)); the distributors list has no entry point.

## Proposed change

### Backend

1. `buildSaleLines` refuses a unit price below the product's approximate cost when one is set: `DISTRIBUTOR_PRICE_BELOW_COST` (400, "Le prix unitaire est inférieur au coût approximatif du produit."). Authoritative whatever the client shows.

### Frontend

- **One cached picker loader.** `useCachedOptions(root, fetch)` in `lib/query`: the page for a query is read through the query client under the given root (`catalog/products`, `catalog/rawMaterials`, `pos/products`) at the `reference` tier, so a second opening, a second line or a second screen reads memory, and a product or raw-material write refreshes it through the existing invalidation map. The empty query is prefetched when the editor mounts so the first opening is instant. Balances shown next to stock items are applied after the read, so they stay live.
- **Direct sale.** `OrderLineEditor` gains `priceEditable` and a catalogue source; the dialog uses the catalogue products (with their cost), lets the price be edited, checks each line against the product's cost before the confirmation and shows the server refusal inline.
- **Total-based entry.** When the price is editable, the line total becomes an input: typing a total sets the unit price to total ÷ quantity (÷ conversion factor on purchases), three decimals; typing a price or a quantity recomputes the total; on leaving the total field the stored total is shown.
- **Accueil.** `Vente directe distributeur` quick action (`distribution.direct_sale`) opening `/distributeurs?vente=directe`; the distributors page opens the dialog for that parameter and gains a `Vente directe` header button.

### Tests

- Backend: below-cost refusal and the boundary (price equal to cost accepted).
- Frontend: `LineEditor.test.tsx` total entry; `ProcurementPages.test.tsx` counts one raw-material request across two openings and derives the price from a typed total with a converted unit; `DistributionPages.test.tsx` runs a direct sale from the quick-action URL with an edited price, a typed total and the below-cost refusal; `AccueilPage.test.tsx` shows the new action.

## Acceptance criteria

- Opening a product or raw-material picker twice, or on two lines, makes one request; creating a product then reopening shows it.
- On a direct sale the unit price can be typed; a price below the product's cost is refused before posting; a typed total of 10,000 for 4 pieces sets 2,500.
- On a purchase of 4 sacs (200 kg) a typed total of 250,000 sets a unit price of 1,250 per kg.
- `Vente directe distributeur` on Accueil opens the dialog on the distributors page.

## Open decisions to surface

- Whether a cashier without `margin.view` may sell below cost unknowingly: the server refuses either way; the client cannot show the cost it does not receive, so the refusal arrives as an error on posting.
- Whether the POS till should also accept an edited price (out of scope; `POS-*` prices from the catalogue).

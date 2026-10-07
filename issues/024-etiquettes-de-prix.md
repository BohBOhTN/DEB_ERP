# 024 · Étiquettes: pick products, print their price tags on A4 sheets without waste

| Field            | Value                                                                          |
| ---------------- | ------------------------------------------------------------------------------ |
| Module           | `frontend/src/features/catalog`                                                |
| Type             | Feature                                                                        |
| Priority         | High                                                                           |
| Depends on       | —                                                                              |
| Suggested branch | `feat/024-etiquettes-de-prix`                                                  |
| Related          | `OD-013` (printed sale ticket, still open; this is a shelf tag, not a receipt) |

## Owner's request

> Since we have the products and their details, we need a module that helps the user pick products (a nice selection by category, by another criterion or by search). Once the products are picked the user gets an A4 document with, for each product, its name, its price and the logo we use in the app, since it is the company's logo. The user can also choose the width and the height of the ticket we will print, and we must optimise the number of tickets per A4 page and their placement, so that when the user prints and cuts them no space is lost and no white space is left over. Pick a clean, nice design for the tickets.

## Findings

- Everything the tag needs is already served: `GET /catalog/products` filters by `q`, `categoryId`, `isResale` and `isActive`, sorts by name, and each product carries its sale price, its category and its base unit. The frontend query type lacks `categoryId`, which the products page passes through a cast.
- The logo is a static asset of the shell, `/assets/dar-el-barka-logo.webp`, shown on the login page and the sidebar. No API call is needed to print it.
- Printing exists for statements only: `window.print()` over `styles/print.css`, which hides the shell and prints the current page with 12 mm page margins. A tag sheet needs the opposite: no page margin, the sheet laid out in millimetres, the preview hidden and the sheets alone printed.
- No server-side document generation exists in the project (no PDF library, no headless browser). A4 sheets rendered by the browser and printed from the print dialog ("Save as PDF" included) cover the request without a dependency.

## Proposed change

Frontend only.

1. **A page `/produits/etiquettes`** (`products.view`), entry `Étiquettes` in the `Catalogue` group and a button on `Produits`. Three parts: the picker, the format, the preview.
2. **Picker.** Search, category filter, origin filter (made here, resold); active products only, by name. A checkbox per row, `Tout sélectionner` for the rows shown, and a selection that survives a change of filter. Each picked product has a number of copies (default 1). The selection lists what is picked with its copies and a way to remove one or clear all.
3. **Format.** Width and height of the tag in millimetres with three presets (`50 × 30`, `70 × 40`, `100 × 60`), free values from 25 to 200 by 15 to 280, kept in the URL with the filters.
4. **Placement.** A4 portrait, 8 mm of margin kept out of the printer's unprintable edge. The tags are placed from the top-left corner with no gap: a grid of upright tags, then the right-hand strip and the bottom strip filled with tags turned by a quarter turn when they fit; the same with the roles swapped; the layout keeping the most tags per page wins, ties going to the one with fewer turned tags. All waste is pushed to the right and the bottom, so two straight cuts separate it. The page states the count: tags, pages, tags per page, share of the sheet used. A tag larger than the sheet is refused with a message.
5. **Tag design.** Cream card with a thin outer hairline as the cut guide and a gold inner frame; the logo at the top left with the bakery's name beside it in the display face, the product name below, the price large in navy with `TND` small and, for a divisible unit (kilogramme, litre), `/ kg` after it. Type scales with the tag so a `50 × 30` and a `100 × 60` tag read alike. Colours are forced on print so the cream and the gold survive the browser's default "no background graphics".
6. **Print.** `Imprimer` opens the print dialog with page size A4 and no margin, the sheets alone printed, one per page; the preview on screen is the same sheets scaled to the width available.

## Tests

- Unit: the packing (counts for known sizes, upright first, turned strips, the swap, the refusal, the order of the slots, the pages).
- Page: the rows from the API, the search and the category filter, select and unselect, copies, `Tout sélectionner`, the summary line, the format presets and free values, the refusal message, `Imprimer` calling `window.print`, the button on `Produits`.
- Playwright: pick two products, set a format, read the summary and the count of tags on the sheet.

## Acceptance criteria

- Picking twelve products of the category `Pains` and the format `70 × 40` gives one A4 sheet of eighteen slots (fourteen upright, four turned on the right), the twelve tags from the top left, the waste at the bottom right; `Imprimer` shows the sheet alone in the print dialog.
- Each tag shows the logo, the product's name and its price in TND; a price per kilogramme reads `/ kg`.
- Three copies of a product give three tags.
- A `250 × 100` tag is refused with a message; `200 × 280` gives one tag per page.

## Decisions surfaced

- `DEC-V2-014` (new): price tags are produced in the browser, printed through the print dialog, on A4 portrait with 8 mm margins, packed from the top-left corner without gaps; the tag carries the logo, the name and the sale price.

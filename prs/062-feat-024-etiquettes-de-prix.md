# Feature 024: price tags picked from the catalogue and printed on A4 sheets without waste

## Branches

- Source: `feat/024-etiquettes-de-prix` (from `dev` after 2.4.0)
- Target: `dev`

## Scope

Closes issue 024 ([issues/024](../issues/024-etiquettes-de-prix.md)):
the owner asked for a module that picks products, prints their name,
price and the company logo on A4, lets the user choose the tag's width
and height, and places the tags so that nothing is wasted when they are
cut. Decision `DEC-V2-014`. Frontend only: no schema, API or migration
change.

## Summary

- **Page `Étiquettes de prix`** at `/produits/etiquettes` (`products.view`),
  listed as `Étiquettes` in the `Catalogue` group and reached from a
  button on `Produits`.
- **Picker.** Search, category and origin (made here, resold) filters in
  the URL; active products by name, a page of 100 at a time with
  `Afficher plus`; a checkbox per row, `Tout sélectionner` for the rows
  shown, a selection that survives a change of filter; each picked product
  takes a number of copies (1 to 50) and can be removed one by one or all
  at once.
- **Format.** Three presets (`Petite` 50 × 30, `Moyenne` 70 × 40, `Grande`
  100 × 60 mm) or a free width and height, 25 to 194 by 15 to 281 mm,
  kept in the URL. The card states the tags per sheet and the share of
  the sheet used.
- **Placement** (`tagLayout.ts`). A4 portrait with 8 mm kept out of each
  edge. A grid of one orientation from the top-left corner with no gap,
  then the right and bottom strips filled with tags turned by a quarter
  turn; the roles are tried both ways and the layout with the most tags
  wins, ties to the fewer turned. The waste gathers at the right and the
  bottom. `70 × 40` gives 18 per sheet (14 upright, 4 turned),
  `50 × 30` gives 33, `100 × 60` gives 7.
- **Tag.** Cream card with a hairline as the cut guide and a double gold
  frame; everything centred: the logo in a gold ring beside the bakery's
  name, a gold rule broken by a diamond, the product's name in the serif
  (two lines at most), then the price in a navy band with cream figures,
  smaller decimals and `TND` (`/ kg` when the unit is divisible). Type
  scales with the tag; colours are forced on print.
- **Print.** `Imprimer` opens the print dialog on the sheets alone, A4
  with no page margin, one sheet per page. On screen the same sheets are
  scaled to the width available, with no horizontal scroll down to
  360 px.

## Out of Scope

- A server-side PDF; the print dialog's "Save as PDF" covers it.
- Barcodes, the product photo or the category on the tag.
- A printed sale ticket (`OD-013` stays open).

## Verification

Run locally on macOS, Node 24, on 2026-10-07:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings (eslint and stylelint)
- `npm run typecheck`: passed
- `npm run test --workspace frontend`: 334 passed (102 files). New:
  the packing (counts for the three presets and the limits, the upright
  tie, the slot order, no overlap and nothing outside the printable area,
  the pages); the page (the active rows with their price per unit, the
  summary and the sheet filled from the selection, `Imprimer` calling
  `window.print`, copies, removal and clearing, the search and category
  filters with `Tout sélectionner` and a selection kept across filters,
  the presets and the free sizes clamped to the sheet, the button on
  `Produits`)
- Backend untouched; its suites were not rerun
- `npm run build`: passed; 202.2 kB gzip initial against 250 kB; POS route 14.3 kB against 120 kB; the page is its own 4.9 kB chunk
- Playwright on the system Brave browser, mocked API, 360, 768 and
  1280 px: the new `priceTags` flow (pick, copies, two sheets; under the
  print media the sheet measures 210 × 297 mm, the 18 slots sit where
  the packing says, the name keeps a line and the price fits for the
  three presets, the layout viewport stays at the device width), the
  catalogue and stock spec, the shell spec and the axe scan with the new
  route: 127 passed, 2 skipped (the cashier phone case on the wider
  projects, as before)
- Owner's decision: automated checks replace screenshots

## Database and Migration Impact

None.

## Environment Impact

None.

## Risks and Follow-Up

- The 8 mm margin suits the usual home and office printers; a printer
  with a wider unprintable edge would clip the outer tags. The margin is
  one constant (`SHEET.marginMm`).
- The browser's print dialog must keep "Background graphics" on for the
  cream and the gold where it ignores `print-color-adjust`; Chrome and
  Brave honour it.

## Merge Checklist

- [ ] CI passed
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue 024
- [ ] Target branch is `dev`

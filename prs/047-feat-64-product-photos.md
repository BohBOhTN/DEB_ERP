# Feature #64: photos on the products, shown on the till tiles

## Branches

- Source: `feat/64-product-photos` (stacked on `fix/66-post-demo-retouches`)
- Target: `dev`

## Scope

Closes issue #64 ([issues/011](../issues/011-produits-photos-caisse.md)):
one photo per product, uploaded from the product form, stored safely on the
server, kept across deploys, served without touching Node, and shown on the
till tiles, the product list and the product page.

## Summary

- **Storage.** `products.image_key` and `image_updated_at`; the bytes live
  under `MEDIA_ROOT` (`/data/media` in the container, the `deb-media`
  named volume). A `MediaStore` (file or memory) writes next to the final
  name then renames, and refuses a key outside its root.
- **Safety.** The route takes one multipart `file` of at most 5 MB in
  memory (`multer`); the type comes from the bytes (JPEG, PNG or WebP
  magic bytes, never the name or the declared type); `sharp` decodes and
  re-encodes to WebP, resized to fit 512 × 512 without enlarging,
  metadata stripped, so the stored file is always one the server produced.
  The file's name is a random UUID. Refusals: `PRODUCT_IMAGE_REQUIRED`,
  `PRODUCT_IMAGE_UNSUPPORTED`, `PRODUCT_IMAGE_INVALID`,
  `PRODUCT_IMAGE_TOO_LARGE` (413), all in French. The previous file is
  deleted after the replacement is committed; removal audits too
  (`product.image`, `product.image_remove`); both bump the version.
- **Routes.** `PUT /catalog/products/{id}/image` and `DELETE …/image` under
  `products.update`; every product read (catalogue and till) carries
  `imageUrl`, the path under `/media`, or null.
- **Serving.** In production nginx serves `/media/` from the volume
  mounted read-only in the frontend container: no listing, `nosniff`,
  thirty days of cache (a replaced photo has a new name). The API also
  serves `/media` statically with `Cross-Origin-Resource-Policy:
cross-origin`, so a development frontend on another origin loads the
  photos; the Vite dev proxy forwards `/media` like `/api`.
- **Frontend.** The client sends `FormData` as multipart; `mediaUrl` puts
  the API's origin in front of the path when the API lives elsewhere.
  Product form: a `Photo` field with the accepted formats and the limit
  stated, a preview, `Retirer la photo`, a refusal before any request for
  a wrong type or an oversized file; the upload runs after the product is
  saved. List: a thumbnail. Page: the photo. Till: a photo tile fills the
  square with the picture, the name over a bottom gradient, the price as
  a badge, the category dropped (the chips filter by it); text tiles keep
  their layout, and once one photo is in the grid every tile takes the
  same square so the rows line up. Lazy-loaded, no library: the POS route
  stays at 13.3 kB gzip.

## Out of Scope

- Photos on raw materials; a larger variant for the product page; the
  owner's open points in the issue (price badge kept, 512 px only).

## Verification

Run locally on macOS, Node 24:

- `npm run format:check`: passed
- `npm run lint`: passed, zero warnings (stylelint included)
- `npm run typecheck`: passed, backend and frontend (types regenerated)
- `npm run test --workspace backend`: 375 passed, 10 skipped (52 files);
  new: magic-byte detection (a text file, an SVG and a GIF refused), the
  re-encode to a 512 px WebP, no enlargement, an undecodable JPEG refused,
  the file store's atomic replace, removal and root check; the service
  storing under a new key, deleting the old file, bumping the version and
  auditing, writing nothing for a non-image, removing once; the routes
  with a real multipart upload, a missing file (400), a 5 MB + 1 upload
  (413), removal, and both refused without `products.update`
- `npm run test --workspace frontend`: 225 passed (93 files); new: the
  media address helper; the till tile with a photo (image, badge, no
  category) beside a text tile, both adding to the cart; the product
  dialog uploading a photo and removing it again, and refusing an SVG
  before any request
- `npm run build`: passed; 201.0 kB gzip initial against 250 kB; POS
  route 13.3 kB against 120 kB
- Playwright on the system Brave browser: the till, catalogue and stock,
  shell flows and the axe scans at three widths: 103 passed
- Not run here: `sharp`'s Alpine binary and the volume mount, proven by
  the `containers` CI job and the first deploy of this change

## Database and Migration Impact

One additive migration, `20260927100000_product_image`: two nullable
columns on `products`.

## Environment Impact

New backend setting `MEDIA_ROOT` (default `media`; set to `/data/media` by
the compose file, nothing to add to `BACKEND_ENV`). New named volume
`deb-media` in the stack, mounted read-write in the API and read-only in
the frontend container; the Dockerfile creates `/data/media` owned by
`node` so the volume takes that ownership on first use. Two new
dependencies, `multer` and `sharp`.

## Risks and Follow-Up

- The volume is the second thing to back up after the database; the
  owner chose no backup step in the pipeline.
- On the first deploy the API container must own `/data/media`; the
  Dockerfile does it, and `deploy/README.md` says what to check if a
  photo upload answers 500.

## Merge Checklist

- [ ] CI passed, including the `containers` job
- [ ] No real `.env` files or secrets committed
- [ ] Scope matches issue #64
- [ ] Target branch is `dev`

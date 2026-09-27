# 011 · Produits: photos on the products, shown on the till tiles

| Field            | Value                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Module           | `backend/src/modules/catalog`, `frontend/src/features/catalog`, `frontend/src/features/pos`, `frontend/nginx.conf`, `deploy/`                   |
| Type             | Feature                                                                                                                                         |
| Priority         | High (asked by the client at the demo)                                                                                                          |
| Depends on       | 010 (the stack the files must survive)                                                                                                          |
| Suggested branch | `feat/product-photos`                                                                                                                           |
| Related          | `07_SCREEN_INVENTORY_AND_IA.md` §4.6 (till tiles), `NFR` upload and security lines of the source of truth, `06` bundle budget for the POS route |

## Owner's request

> Add photos to the products for the POS. The tile shows the name, price, unit and category today; the client wants product images. Handle the upload properly: a persistent location so the images survive a backend redeploy, the security side so the feature cannot be used to expose the server, and performance since the files live on our server. Price and category may go if needed, but the tile must stay clean and the image displayed properly.

## Findings

- `Product` has no image field ([schema.prisma:174](../backend/prisma/schema.prisma#L174)); the API accepts JSON only and serves no files (`helmet()` and `cors` in [app.ts:122](../backend/src/app.ts#L122), no static middleware, no multipart parser in `backend/package.json`).
- The till tile is a text button: name, then "price / unit · category" ([ProductGrid.tsx:55](../frontend/src/features/pos/components/ProductGrid.tsx#L55)); tiles are 140 px wide, 96 px high minimum, in an auto-fill grid ([PosComponents.module.css:44](../frontend/src/features/pos/components/PosComponents.module.css#L44)). The four category tones colour a left rule only.
- The stack ([deploy/docker-compose.yml](../deploy/docker-compose.yml)) mounts no volume: anything written inside the API container is lost at the next deploy, which replaces the container.
- The frontend's nginx serves the built assets and forwards `/api/`; it can serve a mounted folder as static files with cache headers, which keeps image traffic off Node.
- The API's content-security policy allows `img-src 'self' data:`, so same-origin images need no policy change.

## Proposed change

### Backend

1. `products.image_key TEXT NULL`: the file name of the stored image (random, never the upload's name), plus `image_updated_at`. Read models expose `imageUrl` (`/media/products/<key>`) or `null`.
2. `PUT /catalog/products/{id}/image` (`products.update`, multipart, one field `file`, 5 MB ceiling on the raw upload) and `DELETE /catalog/products/{id}/image`. The handler:
   - rejects anything whose bytes are not JPEG, PNG or WebP (magic bytes, not the extension or the declared type);
   - decodes and re-encodes the image with `sharp` to WebP, resized to fit 512 × 512 (tiles never show more), metadata stripped: the stored file is always a file the server produced, never the client's bytes, which closes polyglot and metadata tricks;
   - writes to `MEDIA_ROOT/products/<uuid>.webp` with a temporary name then renames, deletes the previous file, updates the product (version bump, audit `product.image`), and returns the product;
   - is rate-limited like the other posting routes and counts as a write on the product's version.
3. `MEDIA_ROOT` setting (default `./media` in development, `/data/media` in the container). The API never lists or serves the folder itself.

### Frontend

- Product form: an image field with a preview, "Retirer la photo", the accepted formats and the size limit stated; the upload runs after the product is saved (two requests, one dialog), with progress and the usual French errors.
- Product page and list: the thumbnail, a placeholder when none.
- Till tile: the image fills the tile (square, `object-fit: cover`, lazy-loaded, `decoding="async"`), the name over a bottom gradient, the price kept as a small badge in a corner, the category dropped from the tile (its tone rule stays, and the category chips already filter the grid). Tiles without an image keep today's text layout, so a mixed catalogue stays aligned. The grid's row height becomes the tile width (aspect ratio 1), 44 px minimum for the stepper row unchanged. No third-party library: the POS route budget is 120 kB gzip.
- The palette and pickers keep text only.

### Deployment (`deploy/`)

- A named volume `deb-media` mounted read-write at `/data/media` in `backend` and read-only at `/usr/share/nginx/media` in `frontend`; `nginx.conf` gets `location /media/ { alias /usr/share/nginx/media/; expires 30d; add_header Cache-Control "public"; types { image/webp webp; } default_type application/octet-stream; add_header X-Content-Type-Options nosniff; }` with `autoindex off`. The volume survives image updates and `--remove-orphans`; it is listed in the README as the second thing to back up after the database.
- The API container runs as `node`; the volume's owner is set once by an init step (`chown 1000:1000`) documented in the README.

### Tests

- Backend: magic-byte refusal (a PNG renamed `.jpg` passes, a text file named `.png` is refused), the size ceiling, the re-encode to WebP and the resize, the replacement deleting the old file, permission denied without `products.update`, the version bump; the route tests with an in-memory `MEDIA_ROOT`.
- Frontend: the form upload flow with a mocked multipart handler, the tile with and without image, the bundle budget of the POS route in `check-bundle-size.mjs`.
- Playwright: the till at 360 and 1280 px with image tiles, no overflow, axe.

## Acceptance criteria

- A photo set on a product shows on its till tile, its list row and its page within one navigation; removing it restores the text tile.
- A redeploy of the API and the frontend keeps every photo.
- A non-image file, or an image over 5 MB, is refused with a French message and nothing is written; a valid upload never stores the client's bytes.
- `GET /media/` lists nothing; a stored file is served with `image/webp`, cache headers and `nosniff`; the API never serves files.
- Tiles with and without photos sit on the same grid without layout jumps; the POS route stays within its budget.

## Open decisions to surface

- Whether the price badge stays on image tiles (proposed: yes, small, bottom right) or the tile shows the name only as the client allowed.
- The image ceiling: 512 px WebP at quality 80 is about 30 kB per product; a 1024 px variant for the product page would double the storage for a screen the client did not mention (proposed: 512 only).
- Whether raw materials get photos too (proposed: no; nothing displays them).

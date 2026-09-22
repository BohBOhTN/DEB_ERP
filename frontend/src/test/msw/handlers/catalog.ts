import { http } from "msw";
import { makePage } from "../../factories/page.js";
import { makeProduct, type ProductFixture } from "../../factories/product.js";
import { apiError, apiV1, ok } from "../envelope.js";

/// The catalogue as the pattern for every module handler file: a list that
/// honours `q`, `page`, `pageSize`, a detail, a create that echoes
/// validation errors, and a stale-version update.
export function catalogHandlers(
  products: ProductFixture[] = [makeProduct(), makeProduct()],
) {
  return [
    http.get(`${apiV1}/catalog/products`, ({ request }) => {
      const url = new URL(request.url);
      const q = url.searchParams.get("q")?.toLowerCase() ?? "";
      const page = Number(url.searchParams.get("page") ?? "1");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
      const matching = products.filter((product) =>
        product.name.toLowerCase().includes(q),
      );
      const start = (page - 1) * pageSize;

      return ok(
        makePage(matching.slice(start, start + pageSize), {
          page,
          pageSize,
          total: matching.length,
        }),
      );
    }),
    http.get(`${apiV1}/catalog/products/:productId`, ({ params }) => {
      const product = products.find((item) => item.id === params.productId);

      return product
        ? ok({ product })
        : apiError(404, "PRODUCT_NOT_FOUND", "Produit introuvable.");
    }),
    http.post(`${apiV1}/catalog/products`, async ({ request }) => {
      const body = (await request.json()) as Partial<ProductFixture>;

      if (!body.name) {
        return apiError(
          400,
          "VALIDATION_ERROR",
          "Les données saisies sont invalides.",
          {
            name: "Ce champ est obligatoire.",
          },
        );
      }

      return ok({ product: makeProduct(body) }, 201);
    }),
    http.patch(
      `${apiV1}/catalog/products/:productId`,
      async ({ params, request }) => {
        const body = (await request.json()) as Partial<ProductFixture> & {
          version?: number;
        };
        const product = products.find((item) => item.id === params.productId);

        if (!product) {
          return apiError(404, "PRODUCT_NOT_FOUND", "Produit introuvable.");
        }

        if (body.version !== product.version) {
          return apiError(
            409,
            "VERSION_CONFLICT",
            "Cette fiche a été modifiée. Rechargez puis réessayez.",
          );
        }

        return ok({
          product: { ...product, ...body, version: product.version + 1 },
        });
      },
    ),
  ];
}

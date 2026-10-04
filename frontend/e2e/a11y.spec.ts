import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mockApi, ownerPermissions } from "./mockApi";

/// UI-24: axe on every route at every project width, signed in as the owner
/// with the API mocked. Serious and critical violations fail the build; the
/// lower impacts are printed so they can be chased without blocking.
const routes = [
  "/connexion",
  "/",
  "/analyses",
  "/analyses?tab=frequency",
  "/analyses?tab=products",
  "/analyses?tab=customers",
  "/produits",
  "/matieres-premieres",
  "/catalogue/parametres",
  "/stock",
  "/stock/mouvements",
  "/fournisseurs",
  "/achats",
  "/achats/nouveau",
  "/paiements-fournisseurs",
  "/clients",
  "/commandes",
  "/commandes/nouvelle",
  "/caisse",
  "/caisse/ventes",
  "/caisse/sessions",
  "/distributeurs",
  "/distribution/depot-vente",
  "/distribution/sorties/nouvelle",
  "/distribution/reglements",
  "/depenses",
  "/depenses/categories",
  "/simulations",
  "/simulations/nouvelle",
  "/utilisateurs",
  "/roles",
  "/audit",
  "/parametres",
  "/introuvable",
];

for (const route of routes) {
  test(`axe finds no serious or critical issue on ${route}`, async ({
    page,
  }) => {
    await mockApi(page, {
      signedIn: route !== "/connexion",
      permissions: ownerPermissions,
    });
    await page.goto(route);
    await page
      .getByRole("heading", { level: 1 })
      .or(page.getByText("Page introuvable"))
      .first()
      .waitFor();
    // Let skeletons resolve into content before the scan.
    await page.waitForTimeout(400);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .analyze();
    const blocking = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    );
    const minor = results.violations.filter(
      (violation) => !blocking.includes(violation),
    );
    if (minor.length > 0) {
      console.log(
        `${route}: ${minor.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(", ")}`,
      );
    }
    expect(
      blocking.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((node) => node.target.join(" ")).slice(0, 5),
      })),
    ).toEqual([]);
  });
}

import { expect, test } from "@playwright/test";
import { mockApi, ownerPermissions } from "./mockApi";

/// Sprint 19 smoke (AS-001 and AS-020 through the new UI, AS-V2-12): login,
/// the home page, every module reachable from the navigation, logout.
/// Since Sprint 26 every module is rebuilt and shows its own heading; the
/// "Ancienne interface" badge no longer exists (ADR-V2-003 closed).
const modules = [
  ["Analyses", "/analyses"],
  ["Caisse", "/caisse"],
  ["Sessions de caisse", "/caisse/sessions"],
  ["Commandes", "/commandes"],
  ["Clients", "/clients"],
  ["Distributeurs", "/distributeurs"],
  ["Achats", "/achats"],
  ["Produits", "/produits"],
  ["Stock", "/stock"],
  ["Dépenses", "/depenses"],
  ["Utilisateurs", "/utilisateurs"],
  ["Journal d'audit", "/audit"],
] as const;

test("signs in, opens every module inside the shell, and signs out", async ({
  page,
  isMobile,
  viewport,
}) => {
  // Below 900 px the sidebar is a drawer behind the menu button (tablet).
  const drawer = !isMobile && (viewport?.width ?? 1280) < 900;
  await mockApi(page, { signedIn: false, permissions: ownerPermissions });

  await page.goto("/utilisateurs");
  await expect(page).toHaveURL(/\/connexion\?next=%2Futilisateurs/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Dar El Barka" }),
  ).toBeVisible();

  await page.getByLabel(/E-mail/).fill("salma@example.com");
  await page.getByLabel(/Mot de passe/).fill("wrong-password");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    /E-mail ou mot de passe incorrect/,
  );

  await page.getByLabel(/Mot de passe/).fill("correct-password");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/utilisateurs$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Utilisateurs" }),
  ).toBeVisible();

  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /Bonjour, Salma/ }),
  ).toBeVisible();
  await expect(page.getByText("Ventes du jour")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "3 achats en retard" }),
  ).toBeVisible();

  for (const [label, path] of modules) {
    if (isMobile) {
      const bottom = page
        .getByRole("navigation", { name: "Navigation" })
        .last();
      const primary = bottom.getByRole("link", { name: label, exact: true });
      if (await primary.count()) {
        await primary.click();
      } else {
        await bottom.getByRole("button", { name: "Plus" }).click();
        await page
          .getByRole("dialog", { name: "Plus" })
          .getByRole("link", { name: label, exact: true })
          .click();
      }
    } else if (drawer) {
      await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
      await page
        .getByRole("dialog", { name: "Navigation" })
        .getByRole("link", { name: label, exact: true })
        .click();
    } else {
      await page
        .getByRole("complementary", { name: "Navigation" })
        .getByRole("link", { name: label, exact: true })
        .click();
    }

    await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: label }),
    ).toBeVisible();
    await expect(page.getByText("Ancienne interface")).toHaveCount(0);
    // No horizontal page scroll at this width (AS-020, shell only).
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `${label} overflows horizontally`).toBeLessThanOrEqual(0);
  }

  await page.getByRole("button", { name: /Menu utilisateur/ }).click();
  await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/connexion$/);
});

test("a cashier on a phone sees only what the role allows", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone project only");
  await mockApi(page, {
    signedIn: true,
    permissions: ["pos.access", "pos.sell", "orders.view", "customers.view"],
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /Bonjour/ }),
  ).toBeVisible();

  const bottom = page.getByRole("navigation", { name: "Navigation" }).last();
  await expect(bottom.getByRole("link")).toHaveText([
    "Accueil",
    "Caisse",
    "Commandes",
    "Clients",
  ]);
  await bottom.getByRole("button", { name: "Plus" }).click();
  const more = page.getByRole("dialog", { name: "Plus" });
  // The session history is part of the till (issue 014).
  await expect(more.getByRole("link")).toHaveText([
    "Ventes",
    "Sessions de caisse",
  ]);
  await expect(more.getByRole("link", { name: "Fournisseurs" })).toHaveCount(0);
});

import { expect, test } from "@playwright/test";
import { makeAccessState, mockAccess } from "./access";
import { mockApi, ownerPermissions } from "./mockApi";

/// AS-V2-22 at 360 and 1280 px: grant "Voir les soldes clients" to the
/// Caissier role, the audit journal shows the change with before and after,
/// and the last active Super Admin cannot be deactivated (AS-002 refusal
/// explained in French). Then a new user with a temporary password
/// (OD-V2-011) and the settings page with the build identity.
test("grants a permission to a role, reads it in the audit, and refuses to deactivate the last Super Admin", async ({
  page,
  isMobile,
}) => {
  const state = makeAccessState();
  await mockApi(page, { signedIn: true, permissions: ownerPermissions });
  await mockAccess(page, state);

  await page.goto(isMobile ? "/roles/role-cashier" : "/roles");
  if (!isMobile) {
    await page
      .getByRole("list", { name: "Rôles" })
      .getByRole("button", { name: /Caissier/ })
      .click();
  }
  await expect(
    page.getByRole("heading", { level: 2, name: "Caissier" }),
  ).toBeVisible();
  const balances = page.getByRole("checkbox", {
    name: "Voir les soldes clients",
  });
  await expect(balances).not.toBeChecked();
  await balances.click();
  await expect(page.getByText("Modifications non enregistrées.")).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Rôle enregistré").first()).toBeVisible();
  expect(state.roles[1]?.permissionKeys).toContain("customer_balances.view");
  expect(state.audit[0]).toMatchObject({
    action: "role.assign_permissions",
    targetId: "role-cashier",
  });

  await page.goto("/audit");
  await expect(
    page.getByRole("heading", { level: 1, name: "Journal d'audit" }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByText("Modification des autorisations d'un rôle")
    .first()
    .click();
  const sheet = page.getByRole("dialog", {
    name: "Modification des autorisations d'un rôle",
  });
  await expect(sheet).toContainText("permissionKeys");
  await expect(sheet).toContainText("customer_balances.view");
  await expect(sheet).toContainText(state.audit[0]?.correlationId ?? "corr-");
  await page.keyboard.press("Escape");

  await page.goto("/utilisateurs");
  await expect(
    page.getByRole("heading", { level: 1, name: "Utilisateurs" }),
  ).toBeVisible();
  const salma = page
    .getByRole("main")
    .getByText("Salma Ben Ali")
    .first()
    .locator("xpath=ancestor::*[self::tr or self::li or self::article][1]");
  await salma.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Désactiver" }).click();
  const deactivate = page.getByRole("alertdialog", {
    name: "Désactiver Salma Ben Ali",
  });
  await deactivate.getByRole("button", { name: "Désactiver" }).click();
  await expect(deactivate.getByRole("alert")).toHaveText(
    "Le dernier Super Admin actif ne peut pas être désactivé.",
  );
  expect(state.users[0]?.isActive).toBe(true);
  await deactivate.getByRole("button", { name: "Annuler" }).click();

  await page.getByRole("button", { name: "Nouvel utilisateur" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouvel utilisateur" });
  await dialog.getByLabel(/Nom affiché/).fill("Karim Jlassi");
  await dialog.getByLabel(/E-mail/).fill("karim@example.com");
  await expect(dialog.getByLabel(/Mot de passe temporaire/)).toHaveValue(
    /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/,
  );
  await dialog.getByRole("checkbox", { name: "Caissier" }).click();
  await dialog.getByRole("button", { name: "Créer l'utilisateur" }).click();
  await expect(page.getByText("Utilisateur créé").first()).toBeVisible();
  expect(state.users[2]).toMatchObject({
    displayName: "Karim Jlassi",
    roles: [{ id: "role-cashier" }],
  });
  await expect(page.getByRole("main")).toContainText("Karim Jlassi");

  await page.goto("/parametres");
  await expect(
    page.getByRole("heading", { level: 1, name: "Paramètres" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("salma@example.com");
  await expect(page.getByRole("main")).toContainText("1.4.0");
  await expect(page.getByLabel(/Mot de passe/)).toHaveCount(0);
});

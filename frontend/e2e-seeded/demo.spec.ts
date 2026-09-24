import { expect, test, type Page } from "@playwright/test";

/// 10_STAKEHOLDER_DEMO_SCRIPT.md replayed against the seeded backend
/// (UI-25, AS-V2-23): sections 1 to 5 in order, the phone steps on the
/// phone project and the laptop steps on the desktop project. Every number
/// the script reads aloud is asserted where the seed makes it fixed.
const owner = { email: "proprietaire@demo.tn", password: "Demo2026!" };
const cashier = { email: "caissier@demo.tn", password: "Demo2026!" };

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/connexion");
  await expect(
    page.getByRole("heading", { level: 1, name: "Dar El Barka" }),
  ).toBeVisible();
  await page.getByLabel(/E-mail/).fill(account.email);
  await page.getByLabel(/Mot de passe/).fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: /Menu utilisateur/ }).click();
  await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/connexion/);
}

function noEnglish(text: string) {
  // Words the V1 audit flagged as English leaks; accents are asserted by
  // presence of the common French labels.
  return !/\b(Loading|Submit|Cancel|Delete|Error|Success|Dashboard|Settings|Logout)\b/.test(
    text,
  );
}

test.describe.configure({ mode: "serial" });

test("1 and 2: first impression and navigation (laptop)", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "laptop section");
  await login(page, owner);
  await expect(
    page.getByRole("heading", { level: 1, name: /Bonjour, Salma/ }),
  ).toBeVisible();
  await expect(page.getByText("Ventes du jour")).toBeVisible();
  const overdue = page.getByRole("link", { name: /achats? en retard/ });
  await expect(overdue).toBeVisible();
  await overdue.click();
  await expect(page).toHaveURL(/\/achats/);
  expect(noEnglish(await page.getByRole("main").innerText())).toBe(true);

  await page.getByRole("button", { name: "Réduire la barre latérale" }).click();
  await page
    .getByRole("button", { name: "Déployer la barre latérale" })
    .click();

  // Command palette: jump to a customer by name.
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await palette.getByRole("combobox").fill("salah");
  await palette.getByText("Boulangerie Salah").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Boulangerie Salah" }),
  ).toBeVisible();
  await logout(page);
});

test("2 and 3: a morning at the bakery (phone as cashier)", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone section");
  await login(page, cashier);
  const bottom = page.getByRole("navigation", { name: "Navigation" }).last();
  for (const label of ["Accueil", "Caisse", "Commandes", "Clients"]) {
    await expect(
      bottom.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }
  await bottom.getByRole("button", { name: "Plus" }).click();
  const more = page.getByRole("dialog", { name: "Plus" });
  await expect(more.getByRole("link", { name: "Utilisateurs" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // 3.1 Open the till with a 100,000 TND float.
  await bottom.getByRole("link", { name: "Caisse", exact: true }).click();
  await page.getByRole("button", { name: "Ouvrir la caisse" }).click();
  const openDialog = page.getByRole("dialog", { name: "Ouvrir la caisse" });
  await openDialog
    .getByRole("textbox", { name: /Fonds de caisse/ })
    .fill("100");
  await openDialog.getByRole("button", { name: "Ouvrir la caisse" }).click();
  await expect(page.getByText("Caisse ouverte").first()).toBeVisible();

  // 3.2 Three baguettes and a cake, one baguette removed: 0,900 + 18,500 − 0,300.
  const tiles = page.getByRole("list", { name: "Produits" });
  await page.getByRole("searchbox").first().fill("bag");
  await tiles
    .getByRole("button", { name: "Ajouter Baguette", exact: true })
    .click();
  await tiles
    .getByRole("button", { name: "Ajouter un Baguette", exact: true })
    .click();
  await tiles
    .getByRole("button", { name: "Ajouter un Baguette", exact: true })
    .click();
  await page.getByRole("searchbox").first().fill("chocolat");
  await tiles
    .getByRole("button", { name: "Ajouter Gâteau au chocolat", exact: true })
    .click();
  await expect(page.getByRole("main")).toContainText("19,400 TND");
  await page.getByRole("button", { name: "Voir le panier" }).click();
  let cart = page.getByRole("dialog", { name: /Panier/ });
  await cart
    .getByRole("button", { name: "Retirer un Baguette", exact: true })
    .click();
  await expect(cart).toContainText("19,100 TND");
  await cart.getByRole("textbox", { name: /^Montant/ }).fill("20");
  await expect(cart).toContainText("Monnaie à rendre");
  await cart.getByRole("button", { name: "Encaisser" }).click();
  let confirm = page.getByRole("alertdialog", { name: "Encaisser la vente" });
  await expect(confirm).toContainText("Monnaie à rendre : 0,900 TND.");
  await confirm.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Vente enregistrée").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /^VT-/ }),
  ).toBeVisible();

  // 3.4 A registered customer pays 5,000 of 18,500.
  await page.getByRole("button", { name: "Nouvelle vente" }).click();
  await page.getByRole("searchbox").first().fill("chocolat");
  await tiles
    .getByRole("button", { name: "Ajouter Gâteau au chocolat", exact: true })
    .click();
  await page.getByRole("button", { name: "Voir le panier" }).click();
  cart = page.getByRole("dialog", { name: /Panier/ });
  await cart.getByRole("textbox", { name: /^Montant/ }).fill("5");
  await expect(cart).toContainText(
    "Un client enregistré est obligatoire pour une vente à crédit.",
  );
  await cart.getByRole("combobox", { name: "Client" }).click();
  await page.getByPlaceholder("Client de passage").fill("salah");
  await page.getByText("Boulangerie Salah").click();
  await expect(cart).toContainText(
    "13,500 TND seront portés au compte de Boulangerie Salah",
  );
  await cart.getByRole("button", { name: "Encaisser" }).click();
  confirm = page.getByRole("alertdialog", { name: "Encaisser la vente" });
  await confirm.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Vente enregistrée").first()).toBeVisible();

  // 3.5 An order for tomorrow with an advance, from the order editor.
  await page.goto("/commandes/nouvelle");
  await page.getByRole("combobox", { name: "Client" }).click();
  await page.getByPlaceholder("Nom ou téléphone du client").fill("salah");
  await page.getByText("Boulangerie Salah").click();
  await page.getByRole("combobox", { name: "Produit 1" }).click();
  await page.getByPlaceholder("Rechercher produit").fill("fraisier");
  await page.getByText("Fraisier").click();
  await page.getByRole("textbox", { name: "Quantité 1" }).fill("1");
  await page.getByRole("textbox", { name: /Acompte/ }).fill("20");
  await page.getByRole("button", { name: "Enregistrer la commande" }).click();
  await expect(page.getByText("Commande enregistrée").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /^CMD-/ }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Acompte du");

  // 3.6 The customer's balance and a payment that clears it.
  await page.goto("/clients");
  await page.getByRole("searchbox").first().fill("salah");
  await page.getByRole("main").getByText("Boulangerie Salah").first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Boulangerie Salah" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("13,500 TND");
  await page.getByRole("button", { name: "Encaisser un règlement" }).click();
  const payment = page.getByRole("dialog", { name: /règlement/i });
  await payment.getByRole("textbox", { name: /^Montant/ }).fill("13,5");
  await payment.getByRole("button", { name: /Enregistrer/ }).click();
  await expect(page.getByText(/Règlement enregistré/).first()).toBeVisible();
  await expect(page.getByText("Reste à payer").locator("..")).toContainText(
    "0,000 TND",
  );
  await logout(page);
});

test("4: back office (laptop as owner)", async ({ page, isMobile }) => {
  test.skip(isMobile, "laptop section");
  await login(page, owner);

  // 4.1 A purchase with a converted unit and partial terms.
  await page.goto("/achats/nouveau");
  await page.getByRole("combobox", { name: "Fournisseur" }).click();
  await page.getByPlaceholder("Nom du fournisseur").fill("minoterie");
  await page.getByText("Minoterie du Sud").click();
  await page.getByRole("combobox", { name: "Matière première 1" }).click();
  await page.getByPlaceholder("Rechercher matière première").fill("farine t55");
  await page.getByText("Farine T55").first().click();
  await page.getByRole("textbox", { name: "Quantité 1" }).fill("20");
  await page.getByRole("combobox", { name: "Unité 1" }).click();
  await page.getByRole("option", { name: /Sac/ }).click();
  await expect(page.getByRole("main")).toContainText("= 1 000 kg");
  await page.getByRole("textbox", { name: "Prix unitaire 1" }).fill("1,35");
  await page.getByRole("button", { name: "Ajouter une ligne" }).click();
  await page.getByRole("combobox", { name: "Matière première 2" }).click();
  await page.getByPlaceholder("Rechercher matière première").fill("levure fra");
  await page.getByText("Levure fraîche").first().click();
  await page.getByRole("textbox", { name: "Quantité 2" }).fill("5");
  await page.getByRole("textbox", { name: "Prix unitaire 2" }).fill("6,5");
  await page.getByRole("radio", { name: "Partiel" }).click();
  await page.getByRole("textbox", { name: /Montant payé/ }).fill("300");
  const due = new Date(Date.now() + 15 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  await page.getByLabel(/Échéance/).fill(due);
  await page.getByRole("button", { name: "Valider l'achat" }).click();
  const confirm = page.getByRole("alertdialog", { name: /Valider l'achat/ });
  await expect(confirm).toContainText("Stock : +1 000 kg Farine T55");
  await expect(confirm).toContainText("Dette fournisseur Minoterie du Sud");
  await confirm.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Achat validé").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /^AC-/ }),
  ).toBeVisible();

  // 4.2 Stock and traceability.
  await page.goto("/stock");
  await page.getByPlaceholder("Rechercher un article").fill("Farine T55");
  await expect(page.getByRole("main")).toContainText("Farine T55");
  await page.goto("/stock/mouvements");
  await expect(
    page.getByRole("heading", { level: 1, name: "Mouvements" }),
  ).toBeVisible();

  // 4.3 Karim's open dispatch settled 30 sold, 8 returned, 2 unaccounted.
  await page.goto("/distribution/depot-vente");
  await page
    .getByRole("main")
    .getByRole("link", { name: /^BL-/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: /^BL-/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Régler la sortie" }).click();
  const line = page.getByRole("group", { name: "Baguette" });
  await expect(line).toContainText("Reste 40 à classer");
  await line.getByRole("textbox", { name: "Vendue Baguette" }).fill("30");
  await line.getByRole("textbox", { name: "Retournée Baguette" }).fill("8");
  await line.getByRole("textbox", { name: "Non justifiée Baguette" }).fill("2");
  await expect(line).toContainText("Équation vérifiée");
  await page.getByRole("button", { name: "Régler la sortie" }).click();
  const settle = page.getByRole("alertdialog", { name: /^Régler BL-/ });
  await expect(settle).toContainText(
    "Retour en stock principal : +8 Baguette.",
  );
  await expect(settle).toContainText("signalé comme écart sans créer de dette");
  await settle.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Sortie réglée").first()).toBeVisible();

  // 4.4 A gas expense posted at once.
  await page.goto("/depenses");
  await expect(page.getByText("Total dépenses")).toBeVisible();
  await page.getByRole("button", { name: "Nouvelle dépense" }).click();
  const expense = page.getByRole("dialog", { name: "Nouvelle dépense" });
  await expense.getByRole("combobox", { name: "Catégorie" }).click();
  await page.getByRole("option", { name: "Gaz" }).click();
  await expense.getByLabel(/Libellé/).fill("Bouteilles de gaz");
  await expense.getByRole("textbox", { name: /^Montant/ }).fill("120");
  await expense.getByRole("switch", { name: /Valider immédiatement/ }).click();
  await expense.getByRole("button", { name: "Enregistrer la dépense" }).click();
  await expect(
    page.getByText(/Dépense (validée|enregistrée)/).first(),
  ).toBeVisible();

  // 4.5 The brioche simulation with a dearer butter.
  await page.goto("/simulations");
  await page
    .getByRole("main")
    .getByText("Brioche", { exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Brioche" }),
  ).toBeVisible();
  const before = await page
    .getByText(/Coût unitaire/)
    .locator("..")
    .innerText();
  await page
    .getByRole("link", { name: "Modifier" })
    .or(page.getByRole("button", { name: "Modifier" }))
    .first()
    .click();
  await page.getByRole("textbox", { name: "Prix unitaire 2" }).fill("30");
  const after = await page
    .getByText(/Coût unitaire/)
    .locator("..")
    .innerText();
  expect(after).not.toBe(before);
  await expect(page.getByRole("main")).toContainText(
    "Une simulation n'a aucun effet sur le stock ni la comptabilité.",
  );
  await logout(page);
});

test("5: control and trust (laptop then phone)", async ({ page, isMobile }) => {
  if (!isMobile) {
    await login(page, owner);
    await page.goto("/roles");
    await page
      .getByRole("list", { name: "Rôles" })
      .getByRole("button", { name: /Caissier/ })
      .click();
    const balances = page.getByRole("checkbox", {
      name: "Voir les soldes clients",
    });
    if (!(await balances.isChecked())) {
      await balances.click();
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Rôle enregistré").first()).toBeVisible();
    }
    await page.goto("/audit");
    await expect(
      page.getByRole("heading", { level: 1, name: "Journal d'audit" }),
    ).toBeVisible();
    await page
      .getByRole("main")
      .getByText(/Règlement d'une sortie|Modification des autorisations/)
      .first()
      .click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText("Identifiant de corrélation");
    await page.keyboard.press("Escape");
    await logout(page);
    return;
  }

  // The cashier now sees balances and closes the till with a difference.
  await login(page, cashier);
  await page.goto("/clients");
  await expect(page.getByRole("main")).toContainText("TND");
  await page.goto("/caisse");
  await page.getByRole("button", { name: "Clôturer" }).click();
  const closeDialog = page.getByRole("alertdialog", {
    name: "Clôturer la caisse",
  });
  await expect(closeDialog).toContainText("TND");
  await closeDialog
    .getByRole("textbox", { name: /Espèces comptées/ })
    .fill("120");
  await expect(closeDialog).toContainText(/−|\+/);
  await closeDialog.getByRole("button", { name: "Clôturer" }).click();
  await expect(page.getByText("Caisse clôturée").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /Session du/ }),
  ).toBeVisible();
  await logout(page);
});

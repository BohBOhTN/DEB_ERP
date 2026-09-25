import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makeUser } from "../../test/factories/user";
import { authHandlers } from "../../test/msw/handlers/auth";
import {
  accessHandlers,
  makeAccessStore,
  type AccessStore,
} from "../../test/msw/handlers/access";
import { apiV1, ok } from "../../test/msw/envelope";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";
import { generateTemporaryPassword } from "./access.schemas";

const adminPermissions = [
  "users.view",
  "users.create",
  "users.update",
  "users.activate",
  "users.assign_roles",
  "users.reset_password",
  "roles.view",
  "roles.create",
  "roles.update",
  "roles.assign_permissions",
];

/// The session answers with the admin permissions plus whatever the store
/// last granted, so a saved matrix shows up at the next request (AS-002).
function sessionHandlers(store: AccessStore) {
  const user = makeUser({
    displayName: "Salma Ben Ali",
    email: "salma@example.com",
    roles: [{ id: "role-super", name: "Super Admin" }],
  });
  return [
    http.get(`${apiV1}/auth/me`, () =>
      ok({
        user: {
          ...user,
          effectivePermissions: [
            ...adminPermissions,
            ...(store.sessionPermissions ?? []),
          ],
        },
      }),
    ),
    ...authHandlers(user).slice(1),
  ];
}

function renderAt(path: string, store: AccessStore, width = 1280) {
  mockViewport(width);
  server.use(...sessionHandlers(store), ...accessHandlers(store));
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

describe("Access", () => {
  beforeAll(async () => {
    await Promise.all([
      import("./pages/UsersPage"),
      import("./pages/RolesPage"),
      import("../settings/pages/SettingsPage"),
    ]);
  });

  it("generates a readable temporary password of three groups", () => {
    const password = generateTemporaryPassword();
    expect(password).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    expect(password).not.toMatch(/[0OlI1]/);
    expect(generateTemporaryPassword()).not.toBe(password);
  });

  // AS-V2-22 and AS-002: grant a permission to the cashier role from the
  // matrix; the audit records before and after; the session re-read after
  // the save shows the new navigation entry without a deployment.
  it("grants permissions to a role from the matrix and the change applies at the next request", async () => {
    const store = makeAccessStore();
    renderAt("/roles/role-cashier", store);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Rôles et autorisations",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Caissier" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Journal d'audit" }),
    ).not.toBeInTheDocument();
    const balances = screen.getByRole("checkbox", {
      name: "Voir les soldes clients",
    });
    expect(balances).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
    await userEvent.click(balances);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Voir le journal d'audit" }),
    );
    expect(
      screen.getByText("Modifications non enregistrées."),
    ).toBeInTheDocument();
    // The matrix never shows a raw key as text.
    expect(screen.getByRole("main").textContent).not.toMatch(
      /customer_balances\.view|audit\.view/,
    );
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(
      (await screen.findAllByText("Rôle enregistré"))[0],
    ).toBeInTheDocument();
    const cashier = store.roles.find((role) => role.id === "role-cashier");
    expect(cashier?.permissionKeys).toEqual([
      "audit.view",
      "customer_balances.view",
      "customers.view",
      "pos.access",
      "pos.sell",
    ]);
    expect(store.audit[0]).toMatchObject({
      action: "role.assign_permissions",
      targetId: "role-cashier",
      before: { permissionKeys: ["pos.access", "pos.sell", "customers.view"] },
    });
    expect(
      await screen.findByRole("link", { name: "Journal d'audit" }),
    ).toBeInTheDocument();
  });

  it("keeps the Super Admin role read-only and guards unsaved changes on navigation", async () => {
    const store = makeAccessStore();
    const router = renderAt("/roles/role-super", store);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Super Admin" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Le rôle Super Admin est protégé/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Voir les clients" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Enregistrer" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole("list", { name: "Rôles" })).getByRole("button", {
        name: /Caissier/,
      }),
    );
    expect(
      await screen.findByRole("heading", { level: 2, name: "Caissier" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Voir les soldes clients" }),
    );
    await userEvent.click(
      within(screen.getByRole("list", { name: "Rôles" })).getByRole("button", {
        name: /Super Admin/,
      }),
    );
    const guard = await screen.findByRole("alertdialog", {
      name: "Modifications non enregistrées",
    });
    await userEvent.click(
      within(guard).getByRole("button", { name: "Annuler" }),
    );
    expect(router.state.location.pathname).toBe("/roles/role-cashier");
    expect(
      screen.getByRole("checkbox", { name: "Voir les soldes clients" }),
    ).toBeChecked();
  });

  // OD-V2-011: the Super Admin sets a temporary password; AS-002: the last
  // active Super Admin cannot be deactivated and the refusal is explained.
  it("creates a user with a temporary password and refuses to deactivate the last Super Admin", async () => {
    const store = makeAccessStore();
    renderAt("/utilisateurs", store);

    const table = await screen.findByRole("table", { name: "Utilisateurs" });
    await waitFor(() =>
      expect(within(table).getByText("Amine Trabelsi")).toBeInTheDocument(),
    );
    expect(within(table).getByText("Caissier")).toBeInTheDocument();
    expect(within(table).getAllByText("Actif")).toHaveLength(2);

    await userEvent.click(
      screen.getByRole("button", { name: "Nouvel utilisateur" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nouvel utilisateur",
    });
    const password = within(dialog).getByLabelText(
      /Mot de passe temporaire/,
    ) as HTMLInputElement;
    expect(password.value).toMatch(
      /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/,
    );
    const first = password.value;
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Générer un mot de passe" }),
    );
    expect(password.value).not.toBe(first);
    await userEvent.type(
      within(dialog).getByLabelText(/Nom affiché/),
      "Karim Jlassi",
    );
    await userEvent.type(
      within(dialog).getByLabelText(/^E-mail/),
      "karim@example.com",
    );
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "Caissier" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Créer l'utilisateur" }),
    );
    expect(
      (await screen.findAllByText("Utilisateur créé"))[0],
    ).toBeInTheDocument();
    expect(store.users[2]).toMatchObject({
      displayName: "Karim Jlassi",
      email: "karim@example.com",
      roles: [{ id: "role-cashier" }],
    });
    expect(store.audit[0]).toMatchObject({ action: "user.create" });
    await waitFor(() =>
      expect(within(table).getByText("Karim Jlassi")).toBeInTheDocument(),
    );

    const salmaRow = within(table).getByText("Salma Ben Ali").closest("tr")!;
    await userEvent.click(
      within(salmaRow).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Désactiver" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Désactiver Salma Ben Ali",
    });
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Désactiver" }),
    );
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "Le dernier Super Admin actif ne peut pas être désactivé.",
    );
    expect(store.users[0]?.isActive).toBe(true);
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Annuler" }),
    );

    const amineRow = within(table).getByText("Amine Trabelsi").closest("tr")!;
    await userEvent.click(
      within(amineRow).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Désactiver" }),
    );
    await userEvent.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "Désactiver Amine Trabelsi",
        }),
      ).getByRole("button", { name: "Désactiver" }),
    );
    expect(
      (await screen.findAllByText("Utilisateur désactivé"))[0],
    ).toBeInTheDocument();
    expect(store.users[1]?.isActive).toBe(false);
    await waitFor(() =>
      expect(within(table).getByText("Inactif")).toBeInTheDocument(),
    );
  });

  it("resets a password and replaces the roles of a user from the row", async () => {
    const store = makeAccessStore();
    renderAt("/utilisateurs", store);
    const table = await screen.findByRole("table", { name: "Utilisateurs" });
    await waitFor(() =>
      expect(within(table).getByText("Amine Trabelsi")).toBeInTheDocument(),
    );
    const amineRow = within(table).getByText("Amine Trabelsi").closest("tr")!;

    await userEvent.click(
      within(amineRow).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: "Réinitialiser le mot de passe",
      }),
    );
    const reset = await screen.findByRole("dialog", {
      name: /Réinitialiser le mot de passe de Amine Trabelsi/,
    });
    await userEvent.click(
      within(reset).getByRole("button", { name: "Réinitialiser" }),
    );
    expect(
      (await screen.findAllByText("Mot de passe réinitialisé"))[0],
    ).toBeInTheDocument();
    expect(store.audit[0]).toMatchObject({ action: "user.password_reset" });

    await userEvent.click(
      within(amineRow).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Rôles" }),
    );
    const roles = await screen.findByRole("dialog", {
      name: "Rôles de Amine Trabelsi",
    });
    expect(
      within(roles).getByRole("checkbox", { name: "Caissier" }),
    ).toBeChecked();
    await userEvent.click(
      within(roles).getByRole("checkbox", { name: "Super Admin" }),
    );
    await userEvent.click(
      within(roles).getByRole("button", { name: "Enregistrer" }),
    );
    expect(
      (await screen.findAllByText("Rôles enregistrés"))[0],
    ).toBeInTheDocument();
    expect(store.users[1]?.roles.map((role) => role.id)).toEqual([
      "role-super",
      "role-cashier",
    ]);
  });

  // UI-21: the profile as the session knows it and the build identity; no
  // password change until its endpoint exists (OD-V2-011).
  it("shows the profile, the application identity and the build on the settings page", async () => {
    const store = makeAccessStore();
    renderAt("/parametres", store);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Paramètres" }),
    ).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main).toHaveTextContent("Salma Ben Ali");
    expect(main).toHaveTextContent("salma@example.com");
    expect(main).toHaveTextContent("Super Admin");
    await waitFor(() => expect(main).toHaveTextContent("1.4.0"));
    expect(main).toHaveTextContent("abc1234");
    expect(main).toHaveTextContent("Dinar tunisien (TND)");
    expect(screen.queryByLabelText(/Mot de passe/)).not.toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { makeUser } from "../test/factories/user";
import { anonymousHandlers, authHandlers } from "../test/msw/handlers/auth";
import { server } from "../test/msw/server";
import { mockViewport } from "../test/viewport";
import { AppProviders, createQueryClient } from "./providers";
import { createTestRouter } from "./router";

function renderApp(path: string) {
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return router;
}

const owner = makeUser({
  displayName: "Salma Ben Ali",
  roles: [{ id: "role-owner", name: "Gérante" }],
  effectivePermissions: [
    "pos.access",
    "orders.view",
    "customers.view",
    "purchases.view",
    "audit.view",
  ],
});

describe("App", () => {
  // Load the lazy chunks once so no single test pays the first transform.
  beforeAll(async () => {
    await Promise.all([
      import("../features/home/AccueilPage"),
      import("../features/auth/LoginPage"),
    ]);
  });

  it("restores the session and shows the shell with the permitted navigation", async () => {
    mockViewport(1280);
    server.use(...authHandlers(owner));

    renderApp("/");

    expect(
      screen.getByRole("status", { name: "Chargement…" }),
    ).toBeInTheDocument();
    // First render of the lazy home chunk in this file can exceed the default wait.
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: /Bonjour, Salma/ },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();

    const sidebar = screen.getByRole("complementary", { name: "Navigation" });
    expect(
      within(sidebar).getByRole("link", { name: "Caisse" }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("link", { name: "Journal d'audit" }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).queryByRole("link", { name: "Fournisseurs" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Menu utilisateur : Salma Ben Ali/ }),
    ).toHaveTextContent("Gérante");
  });

  it("sends an anonymous visitor to the login page and back after signing in", async () => {
    mockViewport(1280);
    server.use(...anonymousHandlers);

    const router = renderApp("/commandes");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Dar El Barka" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/connexion");
    expect(router.state.location.search).toBe("?next=%2Fcommandes");

    server.use(...authHandlers(owner));
    await userEvent.type(screen.getByLabelText(/E-mail/), "salma@example.com");
    await userEvent.type(
      screen.getByLabelText(/Mot de passe/),
      "correct-password",
    );
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/commandes"),
    );
    expect(await screen.findByText("Ancienne interface")).toBeInTheDocument();
  });

  it("shows the French error on a wrong password", async () => {
    server.use(...anonymousHandlers, ...authHandlers(owner).slice(1));

    renderApp("/connexion");

    await userEvent.type(
      await screen.findByLabelText(/E-mail/),
      "salma@example.com",
    );
    await userEvent.type(
      screen.getByLabelText(/Mot de passe/),
      "wrong-password",
    );
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "E-mail ou mot de passe incorrect.",
    );
  });

  it("denies a route the user lacks the permission for, inside the shell", async () => {
    mockViewport(1280);
    server.use(
      ...authHandlers(makeUser({ effectivePermissions: ["pos.access"] })),
    );

    renderApp("/fournisseurs");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vous n'avez pas l'autorisation d'effectuer cette action.",
    );
    expect(
      screen.getByRole("link", { name: "Retour à l'accueil" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Navigation" }),
    ).toBeInTheDocument();
  });

  it("on a phone shows the four primary destinations the cashier may open, plus Plus", async () => {
    mockViewport(360);
    server.use(
      ...authHandlers(
        makeUser({
          effectivePermissions: ["pos.access", "orders.view", "customers.view"],
        }),
      ),
    );

    renderApp("/");

    await screen.findByRole("heading", { level: 1, name: /Bonjour/ });
    const bottom = screen
      .getAllByRole("navigation", { name: "Navigation" })
      .at(-1) as HTMLElement;
    expect(
      within(bottom).getByRole("link", { name: "Accueil" }),
    ).toBeInTheDocument();
    expect(
      within(bottom).getByRole("link", { name: "Caisse" }),
    ).toBeInTheDocument();
    expect(
      within(bottom).getByRole("link", { name: "Commandes" }),
    ).toBeInTheDocument();
    expect(
      within(bottom).getByRole("link", { name: "Clients" }),
    ).toBeInTheDocument();
    expect(
      within(bottom).getByRole("button", { name: "Plus" }),
    ).toBeInTheDocument();
  });

  it("logs out and returns to the login page", async () => {
    mockViewport(1280);
    server.use(...authHandlers(owner));

    const router = renderApp("/");

    await screen.findByRole("heading", { level: 1, name: /Bonjour/ });
    await userEvent.click(
      screen.getByRole("button", { name: /Menu utilisateur/ }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Se déconnecter" }),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/connexion"),
    );
  });
});

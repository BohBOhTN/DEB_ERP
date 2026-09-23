import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makeUser } from "../../test/factories/user";
import {
  accessHandlers,
  makeAccessStore,
} from "../../test/msw/handlers/access";
import { authHandlers } from "../../test/msw/handlers/auth";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";
import { auditTargetHref } from "./components/auditLinks";

const auditor = makeUser({ effectivePermissions: ["audit.view"] });

function renderAt(path: string, width = 1280) {
  mockViewport(width);
  const store = makeAccessStore();
  server.use(...authHandlers(auditor), ...accessHandlers(store));
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

describe("Audit", () => {
  beforeAll(async () => {
    await import("./pages/AuditPage");
  });

  it("links a target to its rebuilt route when one exists", () => {
    expect(auditTargetHref("product", "p1")).toBe("/produits/p1");
    expect(auditTargetHref("role", "r1")).toBe("/roles/r1");
    expect(auditTargetHref("sale", "s1")).toBe("/caisse/ventes/s1");
    expect(auditTargetHref("unknown", "x")).toBeNull();
    expect(auditTargetHref("product", null)).toBeNull();
  });

  // UI-20: French labels first, the filters in the URL, and a sheet with
  // the before and after of one event and its correlation id.
  it("lists events in French, filters by action through the URL and opens the before and after", async () => {
    const router = renderAt("/audit");

    const table = await screen.findByRole("table", { name: "Journal d'audit" });
    await waitFor(() =>
      expect(
        within(table).getByText("Modification des autorisations d'un rôle"),
      ).toBeInTheDocument(),
    );
    expect(within(table).getByText("Vente en caisse")).toBeInTheDocument();
    expect(table.textContent).not.toMatch(/role\.assign_permissions|pos_sale/);
    expect(within(table).getByRole("link", { name: "Rôle" })).toHaveAttribute(
      "href",
      "/roles/role-cashier",
    );

    await userEvent.click(screen.getByRole("combobox", { name: "Action" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Vente en caisse" }),
    );
    expect(router.state.location.search).toContain("action=pos_sale.post");
    await waitFor(() =>
      expect(
        within(table).queryByText("Modification des autorisations d'un rôle"),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Réinitialiser/ }),
    );
    await waitFor(() =>
      expect(
        within(table).getByText("Modification des autorisations d'un rôle"),
      ).toBeInTheDocument(),
    );

    await userEvent.click(
      within(table).getByText("Modification des autorisations d'un rôle"),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Modification des autorisations d'un rôle",
    });
    expect(sheet).toHaveTextContent("Salma Ben Ali");
    const diff = within(sheet).getByRole("table", { name: "Avant et après" });
    const row = within(diff).getByRole("row", { name: /permissionKeys/ });
    expect(row).toHaveTextContent("pos.access");
    expect(row).toHaveTextContent("pos.access, pos.sell");
    expect(sheet).toHaveTextContent("corr-0001");
    expect(
      within(sheet).getByRole("button", { name: "Copier" }),
    ).toBeInTheDocument();
  });
});

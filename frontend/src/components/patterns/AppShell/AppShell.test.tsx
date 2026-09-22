import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockViewport } from "../../../test/viewport.js";
import { AppShell, type ShellNavItem } from "./AppShell.js";

const items: ShellNavItem[] = [
  {
    id: "home",
    label: "Accueil",
    icon: <svg />,
    href: "/",
    mobilePrimary: true,
  },
  {
    id: "pos",
    label: "Caisse",
    icon: <svg />,
    href: "/caisse",
    group: "Ventes",
    mobilePrimary: true,
  },
  {
    id: "orders",
    label: "Commandes",
    icon: <svg />,
    href: "/commandes",
    group: "Ventes",
    mobilePrimary: true,
  },
  {
    id: "customers",
    label: "Clients",
    icon: <svg />,
    href: "/clients",
    group: "Ventes",
    mobilePrimary: true,
  },
  {
    id: "suppliers",
    label: "Fournisseurs",
    icon: <svg />,
    href: "/fournisseurs",
    group: "Achats",
  },
];

describe("AppShell", () => {
  it("on a phone shows the bottom nav with the four primaries and Plus", async () => {
    mockViewport(360);
    const onNavigate = vi.fn();
    render(
      <AppShell
        items={items}
        activeId="home"
        user={{ displayName: "Amine Trabelsi", roleNames: ["Caissier"] }}
        title="Accueil"
        onNavigate={onNavigate}
      >
        Contenu
      </AppShell>,
    );

    const bottom = screen
      .getAllByRole("navigation", { name: "Navigation" })
      .at(-1) as HTMLElement;
    expect(bottom).toHaveTextContent("Accueil");
    expect(bottom).toHaveTextContent("Clients");
    expect(bottom).toHaveTextContent("Plus");
    expect(bottom).not.toHaveTextContent("Fournisseurs");

    await userEvent.click(screen.getByRole("button", { name: "Plus" }));
    await userEvent.click(screen.getByRole("link", { name: "Fournisseurs" }));
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "suppliers" }),
    );
  });

  it("on desktop shows the sidebar with groups and the collapse control", async () => {
    mockViewport(1280);
    const onCollapsedChange = vi.fn();
    render(
      <AppShell
        items={items}
        activeId="pos"
        user={{ displayName: "Amine Trabelsi", roleNames: ["Caissier"] }}
        onCollapsedChange={onCollapsedChange}
      >
        Contenu
      </AppShell>,
    );

    expect(
      screen.getByRole("complementary", { name: "Navigation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ventes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Caisse" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("main")).toHaveTextContent("Contenu");

    await userEvent.click(
      screen.getByRole("button", { name: "Réduire la barre latérale" }),
    );
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });
});

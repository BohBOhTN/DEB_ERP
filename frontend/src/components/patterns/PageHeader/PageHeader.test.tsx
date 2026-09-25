import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader.js";

describe("PageHeader", () => {
  it("renders one h1, breadcrumbs and the actions", () => {
    render(
      <PageHeader
        eyebrow="Achats"
        title="Fournisseurs"
        description="12 fournisseurs actifs"
        breadcrumbs={[
          { label: "Achats", href: "/achats" },
          { label: "Fournisseurs" },
        ]}
        actions={<button>Ajouter</button>}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Fournisseurs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Fil d'Ariane" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Achats" })).toHaveAttribute(
      "href",
      "/achats",
    );
    expect(
      screen.getByText("Fournisseurs", { selector: "span" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeInTheDocument();
  });
});

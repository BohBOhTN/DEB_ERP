import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tabs } from "./Tabs.js";

describe("Tabs", () => {
  it("switches panels by click and arrow key", async () => {
    render(
      <Tabs
        label="Catalogue"
        items={[
          {
            value: "categories",
            label: "Catégories",
            content: "Liste des catégories",
          },
          { value: "units", label: "Unités", content: "Liste des unités" },
        ]}
      />,
    );

    expect(screen.getByText("Liste des catégories")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Unités" }));
    expect(screen.getByText("Liste des unités")).toBeVisible();

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Catégories" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

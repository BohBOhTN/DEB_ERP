import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Accordion } from "./Accordion.js";

describe("Accordion", () => {
  it("exposes each group as a disclosure that opens on click", async () => {
    const { container } = render(
      <Accordion
        label="Dépôt-vente"
        items={[
          {
            id: "a",
            title: "Karim",
            meta: "40 pièces",
            content: <p>Contenu Karim</p>,
          },
          {
            id: "b",
            title: "Sana",
            content: <p>Contenu Sana</p>,
            defaultOpen: true,
          },
        ]}
      />,
    );

    const groups = container.querySelectorAll("details");
    expect(groups).toHaveLength(2);
    expect(groups[0]).not.toHaveAttribute("open");
    expect(groups[1]).toHaveAttribute("open");
    await userEvent.click(screen.getByText("Karim"));
    expect(groups[0]).toHaveAttribute("open");
  });
});

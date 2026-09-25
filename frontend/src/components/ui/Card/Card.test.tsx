import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardBody, CardFooter, CardHeader } from "./Card.js";

describe("Card", () => {
  it("renders the header title as a heading with actions", () => {
    render(
      <Card>
        <CardHeader
          title="Ventes du jour"
          description="Aujourd'hui"
          actions={<button>Voir</button>}
        />
        <CardBody>Contenu</CardBody>
        <CardFooter>Total</CardFooter>
      </Card>,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Ventes du jour" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voir" })).toBeInTheDocument();
  });

  it("lets a section lower the heading level", () => {
    render(<CardHeader as="h3" title="Détail" />);

    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
  });
});

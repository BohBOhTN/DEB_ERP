import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  LineEditor,
  lineTotal,
  linesTotal,
  newLine,
  unitPriceForTotal,
  type EditorLine,
} from "./LineEditor.js";

function Harness() {
  const [lines, setLines] = useState<EditorLine[]>([
    {
      ...newLine(),
      item: { value: "p1", label: "Farine T55" },
      quantity: "50",
      unitPriceTnd: "2.5",
    },
  ]);

  return (
    <>
      <LineEditor
        lines={lines}
        onChange={setLines}
        loadItems={async () => []}
      />
      <output data-testid="total">{linesTotal(lines)}</output>
    </>
  );
}

describe("LineEditor", () => {
  it("computes line and document totals as decimal strings", () => {
    expect(lineTotal({ quantity: "50", unitPriceTnd: "2.5" })).toBe("125.000");
    expect(
      linesTotal([
        { quantity: "1.5", unitPriceTnd: "0.35" },
        { quantity: "2", unitPriceTnd: "1.2" },
      ]),
    ).toBe("2.925");
    expect(lineTotal({ quantity: "", unitPriceTnd: "" })).toBe("0.000");
  });

  it("adds and removes lines", async () => {
    render(<Harness />);

    expect(screen.getByTestId("total")).toHaveTextContent("125.000");
    await userEvent.click(
      screen.getByRole("button", { name: "Ajouter une ligne" }),
    );
    expect(screen.getAllByRole("combobox", { name: /Produit/ })).toHaveLength(
      2,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Retirer la ligne 1" }),
    );
    expect(screen.getByTestId("total")).toHaveTextContent("0.000");
  });

  // Issue 009: a typed line total sets the unit price from the quantity;
  // a typed price or quantity takes the total back to quantity × price.
  it("derives the unit price from a typed line total", async () => {
    render(<Harness />);
    const total = screen.getByRole("textbox", { name: "Total ligne 1" });
    const price = screen.getByRole("textbox", { name: "Prix unitaire 1" });

    await userEvent.clear(total);
    await userEvent.type(total, "100");
    expect(price).toHaveValue("2,000");
    expect(screen.getByTestId("total")).toHaveTextContent("100.000");

    await userEvent.clear(price);
    await userEvent.type(price, "3");
    expect(screen.getByTestId("total")).toHaveTextContent("150.000");
    expect(total).toHaveValue("150,000");

    expect(unitPriceForTotal("4", "10")).toBe("2.500");
    expect(unitPriceForTotal("3", "10")).toBe("3.333");
    expect(unitPriceForTotal("0", "10")).toBeNull();
    expect(unitPriceForTotal("4", "")).toBeNull();
  });
});

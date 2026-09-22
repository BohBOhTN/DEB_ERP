import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  LineEditor,
  lineTotal,
  linesTotal,
  newLine,
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
});

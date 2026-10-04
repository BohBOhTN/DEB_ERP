import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Heatmap } from "./Heatmap.js";

const rows = ["Lun", "Mar"];
const columns = ["7 h", "8 h", "9 h"];
const cells = [
  { row: 0, column: 0, value: 2, label: "Lundi, 7 h : 2 ventes" },
  { row: 1, column: 1, value: 8, label: "Mardi, 8 h : 8 ventes" },
  { row: 1, column: 2, value: 4, label: "Mardi, 9 h : 4 ventes" },
];

function renderHeatmap() {
  render(
    <Heatmap
      title="Ventes par jour et par heure"
      rows={rows}
      columns={columns}
      cells={cells}
      emptyLabel={(row, column) => `${rows[row]} ${columns[column]} : rien`}
      caption="Survolez une case."
    />,
  );
}

describe("Heatmap", () => {
  it("is a labelled grid with headers and one readable cell per position", () => {
    renderHeatmap();

    const grid = screen.getByRole("grid", {
      name: "Ventes par jour et par heure",
    });
    expect(within(grid).getAllByRole("columnheader")).toHaveLength(3);
    expect(within(grid).getAllByRole("rowheader")).toHaveLength(2);
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(6);
    expect(
      within(grid).getByRole("gridcell", { name: "Mar 7 h : rien" }),
    ).toHaveAttribute("data-level", "0");
  });

  it("shades a cell by its share of the busiest one", () => {
    renderHeatmap();

    const level = (name: string) =>
      screen.getByRole("gridcell", { name }).getAttribute("data-level");
    expect(level("Mardi, 8 h : 8 ventes")).toBe("4");
    expect(level("Mardi, 9 h : 4 ventes")).toBe("2");
    expect(level("Lundi, 7 h : 2 ventes")).toBe("1");
  });

  it("takes one tab stop, on the busiest cell, and moves with the arrows", async () => {
    renderHeatmap();
    expect(screen.getByText("Survolez une case.")).toBeInTheDocument();

    await userEvent.tab();
    const busiest = screen.getByRole("gridcell", {
      name: "Mardi, 8 h : 8 ventes",
    });
    expect(busiest).toHaveFocus();
    expect(
      screen.getAllByRole("gridcell").filter((cell) => cell.tabIndex === 0),
    ).toHaveLength(1);

    await userEvent.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("gridcell", { name: "Mardi, 9 h : 4 ventes" }),
    ).toHaveFocus();
    // The grid has no fourth column: the focus stays on the edge.
    await userEvent.keyboard("{ArrowRight}{ArrowUp}");
    expect(
      screen.getByRole("gridcell", { name: "Lun 9 h : rien" }),
    ).toHaveFocus();
    // The line under the grid reads the focused cell.
    expect(screen.getByText("Lun 9 h : rien")).toBeInTheDocument();
  });
});

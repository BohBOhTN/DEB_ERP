import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankedList } from "./RankedList.js";

describe("RankedList", () => {
  it("renders an ordered list with values", () => {
    render(
      <RankedList
        title="Produits les plus vendus"
        items={[
          { label: "Baguette", value: 320, formatted: "320" },
          { label: "Croissant", value: 140, formatted: "140" },
        ]}
      />,
    );

    expect(
      screen.getByRole("list", { name: "Produits les plus vendus" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("320")).toHaveClass("tabular-nums");
  });
});

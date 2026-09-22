import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeyValueList } from "./KeyValueList.js";

describe("KeyValueList", () => {
  it("renders a definition list with a dash for missing values", () => {
    render(
      <KeyValueList
        items={[
          { label: "Téléphone", value: "22 333 444" },
          { label: "Solde dû", value: "125,000 TND", numeric: true },
          { label: "Notes", value: null },
        ]}
      />,
    );

    expect(screen.getAllByRole("term")).toHaveLength(3);
    expect(screen.getByText("22 333 444")).toBeInTheDocument();
    expect(screen.getByText("125,000 TND")).toHaveClass("tabular-nums");
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { AllocationTable, type AllocationRow } from "./AllocationTable.js";

function Harness({ amountTnd }: { amountTnd: string }) {
  const [rows, setRows] = useState<AllocationRow[]>([
    { id: "a", label: "VT-000001", balanceTnd: "200", amountTnd: "" },
    { id: "b", label: "VT-000002", balanceTnd: "100", amountTnd: "" },
  ]);

  return (
    <AllocationTable amountTnd={amountTnd} rows={rows} onChange={setRows} />
  );
}

describe("AllocationTable", () => {
  it("recomputes the unallocated remainder and flags an excess", async () => {
    render(<Harness amountTnd="300" />);

    expect(
      screen.getByText("Reste à répartir").parentElement,
    ).toHaveTextContent("300,000 TND");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Affectation VT-000001" }),
      "200",
    );
    expect(
      screen.getByText("Reste à répartir").parentElement,
    ).toHaveTextContent("100,000 TND");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Affectation VT-000002" }),
      "150",
    );
    expect(
      screen.getByText("Affectations en excès").parentElement,
    ).toHaveTextContent("50,000 TND");
  });

  it("splits the amount over the rows in order, each up to its balance", async () => {
    render(<Harness amountTnd="250" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Répartir automatiquement" }),
    );

    expect(
      screen.getByRole("textbox", { name: "Affectation VT-000001" }),
    ).toHaveValue("200,000");
    expect(
      screen.getByRole("textbox", { name: "Affectation VT-000002" }),
    ).toHaveValue("50,000");
    expect(
      screen.getByText("Reste à répartir").parentElement,
    ).toHaveTextContent("0,000 TND");
  });
});

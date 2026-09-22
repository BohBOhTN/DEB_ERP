import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Select } from "./Select.js";

const options = [
  { value: "bread", label: "Pains" },
  { value: "pastry", label: "Pâtisserie" },
];

function Harness({ clearable = false }: { clearable?: boolean }) {
  const [value, setValue] = useState<string | null>(null);

  return (
    <>
      <Select
        aria-label="Catégorie"
        options={options}
        value={value}
        onValueChange={setValue}
        placeholder="Choisir une catégorie"
        clearable={clearable}
      />
      <output data-testid="value">{value ?? "aucune"}</output>
    </>
  );
}

describe("Select", () => {
  it("shows the placeholder and picks an option with the keyboard", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "Catégorie" });

    expect(trigger).toHaveTextContent("Choisir une catégorie");
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByTestId("value")).toHaveTextContent("pastry");
    expect(trigger).toHaveTextContent("Pâtisserie");
  });

  it("clears the value when clearable", async () => {
    render(<Harness clearable />);
    const trigger = screen.getByRole("combobox", { name: "Catégorie" });

    trigger.focus();
    await userEvent.keyboard("{Enter}{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent("bread");

    await userEvent.click(screen.getByRole("button", { name: "Effacer" }));
    expect(screen.getByTestId("value")).toHaveTextContent("aucune");
  });
});

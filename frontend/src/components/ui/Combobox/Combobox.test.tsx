import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxOption } from "./Combobox.js";

const catalogue: ComboboxOption[] = [
  { value: "p1", label: "Pain complet", description: "1,200 TND" },
  { value: "p2", label: "Thé à la menthe", description: "2,500 TND" },
];

function Harness({ onCreate }: { onCreate?: (query: string) => void }) {
  const [value, setValue] = useState<ComboboxOption | null>(null);
  const loadOptions = vi.fn(async (query: string) =>
    catalogue.filter((option) =>
      option.label.toLowerCase().includes(query.toLowerCase()),
    ),
  );

  return (
    <>
      <Combobox
        aria-label="Produit"
        loadOptions={loadOptions}
        value={value}
        onChange={setValue}
        createLabel={onCreate ? "Créer" : undefined}
        onCreate={onCreate}
      />
      <output data-testid="value">{value?.label ?? "aucun"}</output>
    </>
  );
}

describe("Combobox", () => {
  it("searches asynchronously and selects with the keyboard", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("combobox", { name: "Produit" }));
    await userEvent.type(screen.getByPlaceholderText("Rechercher"), "thé");
    await waitFor(() =>
      expect(screen.queryByText("Pain complet")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Thé à la menthe")).toBeInTheDocument();

    await userEvent.keyboard("{Enter}");

    expect(screen.getByTestId("value")).toHaveTextContent("Thé à la menthe");
  });

  it("shows the empty text and offers creation", async () => {
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} />);

    await userEvent.click(screen.getByRole("combobox", { name: "Produit" }));
    await userEvent.type(screen.getByPlaceholderText("Rechercher"), "brioche");
    await waitFor(() =>
      expect(screen.getByText(/Créer « brioche »/)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText(/Créer « brioche »/));

    expect(onCreate).toHaveBeenCalledWith("brioche");
  });
});

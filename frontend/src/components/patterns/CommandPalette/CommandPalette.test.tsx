import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  it("filters navigation items by the typed words and runs the selection", async () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        items={[
          { id: "pos", label: "Caisse", group: "Aller à", onSelect },
          {
            id: "orders",
            label: "Commandes",
            group: "Aller à",
            onSelect: () => undefined,
          },
        ]}
      />,
    );
    const input = screen.getByRole("combobox", {
      name: "Palette de commandes",
    });
    await userEvent.type(input, "cai");
    expect(screen.getByText("Caisse")).toBeInTheDocument();
    expect(screen.queryByText("Commandes")).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("searches the server after two characters and shows the results in their group", async () => {
    const search = vi.fn(async (query: string) => [
      {
        id: "c1",
        label: `Boulangerie ${query}`,
        group: "Clients",
        onSelect: () => undefined,
      },
    ]);
    render(
      <CommandPalette
        open
        onOpenChange={() => undefined}
        items={[]}
        search={search}
      />,
    );
    await userEvent.type(screen.getByRole("combobox"), "s");
    expect(search).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole("combobox"), "a");
    await waitFor(() => expect(search).toHaveBeenCalledWith("sa"));
    expect(await screen.findByText("Boulangerie sa")).toBeInTheDocument();
    expect(screen.getByText("Clients")).toBeInTheDocument();
  });
});

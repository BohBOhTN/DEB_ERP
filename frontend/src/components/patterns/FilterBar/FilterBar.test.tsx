import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockViewport } from "../../../test/viewport.js";
import { FilterBar } from "./FilterBar.js";

describe("FilterBar", () => {
  it("debounces the search and exposes the filters on desktop", async () => {
    mockViewport(1280);
    const onSearchChange = vi.fn();
    render(
      <FilterBar
        onSearchChange={onSearchChange}
        filters={<select aria-label="Statut" />}
        activeCount={1}
        onReset={() => undefined}
      />,
    );

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Rechercher" }),
      "farine",
    );
    expect(onSearchChange).not.toHaveBeenCalledWith("farine");
    await waitFor(() =>
      expect(onSearchChange).toHaveBeenLastCalledWith("farine"),
    );

    expect(
      screen.getByRole("combobox", { name: "Statut" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Réinitialiser" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("search")).toBeInTheDocument();
  });
});

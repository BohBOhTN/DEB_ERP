import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch.js";

describe("Switch", () => {
  it("is a labelled switch that reports its state", async () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch label="Encaissé à la caisse" onCheckedChange={onCheckedChange} />,
    );

    await userEvent.click(
      screen.getByRole("switch", { name: "Encaissé à la caisse" }),
    );

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});

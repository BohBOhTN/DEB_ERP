import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress } from "./Progress.js";

describe("Progress", () => {
  it("exposes the clamped value", () => {
    render(<Progress value={140} label="Objectif" />);

    expect(
      screen.getByRole("progressbar", { name: "Objectif" }),
    ).toHaveAttribute("aria-valuenow", "100");
  });

  it("is indeterminate without a value", () => {
    render(<Progress label="Actualisation" />);

    expect(screen.getByRole("progressbar")).not.toHaveAttribute(
      "aria-valuenow",
    );
  });
});

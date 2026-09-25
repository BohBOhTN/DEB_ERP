import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "./Spinner.js";

describe("Spinner", () => {
  it("is a status with a label when it stands alone", () => {
    render(<Spinner label="Chargement" />);

    expect(
      screen.getByRole("status", { name: "Chargement" }),
    ).toBeInTheDocument();
  });

  it("is decorative without a label", () => {
    const { container } = render(<Spinner />);

    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

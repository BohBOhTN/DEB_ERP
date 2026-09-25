import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./Skeleton.js";

describe("Skeleton", () => {
  it("renders the requested number of table rows and announces loading", () => {
    render(<Skeleton variant="table" rows={3} />);

    const table = screen.getByLabelText("Chargement");
    expect(table).toHaveAttribute("aria-busy", "true");
    expect(table.childElementCount).toBe(3);
  });

  it("hides a single placeholder from assistive technology", () => {
    const { container } = render(<Skeleton width={120} />);

    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});

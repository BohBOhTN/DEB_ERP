import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Illustration } from "./Illustration";

describe("Illustration", () => {
  it("renders a decorative SVG hidden from assistive technology", () => {
    const { container } = render(<Illustration name="shelf" size={96} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "96");
    expect(svg?.querySelectorAll("path, rect, circle").length).toBeGreaterThan(
      3,
    );
  });
});

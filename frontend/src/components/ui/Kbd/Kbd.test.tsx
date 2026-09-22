import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Kbd } from "./Kbd.js";

describe("Kbd", () => {
  it("renders a kbd element", () => {
    render(<Kbd>F9</Kbd>);

    expect(screen.getByText("F9").tagName).toBe("KBD");
  });
});

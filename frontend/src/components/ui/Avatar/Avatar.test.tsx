import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, initialsOf } from "./Avatar.js";

describe("Avatar", () => {
  it("derives initials from the first and last names", () => {
    expect(initialsOf("Amine Trabelsi")).toBe("AT");
    expect(initialsOf("Amine")).toBe("A");
    expect(initialsOf("  ")).toBe("?");
  });

  it("exposes the full name to assistive technology", () => {
    render(<Avatar name="Amine Trabelsi" />);

    expect(
      screen.getByRole("img", { name: "Amine Trabelsi" }),
    ).toHaveTextContent("AT");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge.js";

describe("Badge", () => {
  it("always renders text and hides the icon from assistive technology", () => {
    render(
      <Badge tone="success" icon={<svg data-testid="icon" />}>
        Validé
      </Badge>,
    );

    expect(screen.getByText("Validé")).toBeInTheDocument();
    expect(screen.getByTestId("icon").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

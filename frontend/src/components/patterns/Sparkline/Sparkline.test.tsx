import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "./Sparkline.js";

describe("Sparkline", () => {
  it("is an image with a textual summary", () => {
    render(
      <Sparkline
        title="Dépenses des 30 derniers jours"
        values={[3, 5, 2, 8]}
        summary="1 250 TND au total"
      />,
    );

    expect(
      screen.getByRole("img", {
        name: /Dépenses des 30 derniers jours. 1 250 TND au total/,
      }),
    ).toBeInTheDocument();
  });
});

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiGrid } from "./KpiGrid.js";

describe("KpiGrid", () => {
  it("lays out its children", () => {
    const { container } = render(
      <KpiGrid columns={3}>
        <div>A</div>
        <div>B</div>
        <div>C</div>
      </KpiGrid>,
    );

    expect(container.firstChild?.childNodes).toHaveLength(3);
  });
});

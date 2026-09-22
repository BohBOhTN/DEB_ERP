import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateInput } from "./DateInput.js";

describe("DateInput", () => {
  it("emits the ISO date the browser produces", () => {
    const onChange = vi.fn();
    render(<DateInput aria-label="Date" value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-22" },
    });

    expect(onChange).toHaveBeenCalledWith("2026-09-22");
  });
});

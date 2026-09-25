import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateTimeInput, localDateTimeToIso } from "./DateTimeInput.js";

describe("DateTimeInput", () => {
  it("emits the local date-time string", () => {
    const onChange = vi.fn();
    render(<DateTimeInput aria-label="Heure" value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Heure"), {
      target: { value: "2026-09-22T14:30" },
    });

    expect(onChange).toHaveBeenCalledWith("2026-09-22T14:30");
  });

  it("converts to an ISO instant and rejects garbage", () => {
    expect(localDateTimeToIso("2026-09-22T14:30")).toMatch(
      /^2026-09-22T\d{2}:\d{2}:00\.000Z$/,
    );
    expect(localDateTimeToIso("")).toBeNull();
    expect(localDateTimeToIso("nope")).toBeNull();
  });
});

import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useUrlState } from "./useUrlState.js";

const defaults = { page: 1, pageSize: 25, q: "", isActive: true };

function wrapper(initialEntries: string[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    );
  };
}

describe("useUrlState", () => {
  it("reads typed values from the URL and falls back to defaults", () => {
    const { result } = renderHook(() => useUrlState(defaults), {
      wrapper: wrapper(["/achats?page=3&q=farine&isActive=false&pageSize=abc"]),
    });

    expect(result.current[0]).toEqual({
      page: 3,
      pageSize: 25,
      q: "farine",
      isActive: false,
    });
  });

  it("writes a patch and drops keys equal to their default", () => {
    const { result } = renderHook(() => useUrlState(defaults), {
      wrapper: wrapper(["/achats"]),
    });

    act(() => result.current[1]({ page: 2, q: "sucre" }));
    expect(result.current[0]).toMatchObject({ page: 2, q: "sucre" });

    act(() => result.current[1]({ page: 1, q: "" }));
    expect(result.current[0]).toEqual(defaults);
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

afterEach(() => {
  fetchMock.mockReset();
});

describe("App", () => {
  it("renders the R0 foundation status when the API is available", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          status: "ok",
          service: "api",
          environment: "test",
          database: {
            status: "ok",
          },
        },
        meta: {
          correlationId: "test",
        },
      }),
    });

    render(<App />);

    expect(screen.getByRole("heading", { name: "Dar El Barka" })).toBeVisible();
    expect(screen.getByText("Verification en cours...")).toBeVisible();

    await waitFor(() => {
      expect(screen.getByText("Disponible")).toBeVisible();
      expect(screen.getByText("Connectee")).toBeVisible();
    });
  });

  it("renders a French error when the API cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Impossible de joindre l'API/)).toBeVisible();
    });
  });
});

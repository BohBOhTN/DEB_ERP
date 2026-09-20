import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

afterEach(() => {
  fetchMock.mockReset();
});

const authenticatedUser = {
  id: "user-1",
  email: "admin@example.com",
  displayName: "Admin",
  effectivePermissions: [],
};

describe("App", () => {
  it("renders the protected shell when an active session exists", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          user: authenticatedUser,
        },
        meta: {
          correlationId: "test",
        },
      }),
    });

    render(<App />);

    expect(screen.getByText("Chargement de la session...")).toBeVisible();

    await waitFor(() => {
      expect(screen.getByText("Session active")).toBeVisible();
      expect(screen.getByText("Admin")).toBeVisible();
    });
  });

  it("renders login and authenticates with French states", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("missing session"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            user: authenticatedUser,
          },
          meta: {
            correlationId: "test",
          },
        }),
      });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Se connecter" }),
      ).toBeVisible();
    });

    fireEvent.change(screen.getByLabelText("Adresse e-mail"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() => {
      expect(screen.getByText("Session active")).toBeVisible();
    });
  });

  it("shows the generic French login error", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("missing session"))
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            code: "AUTHENTICATION_REQUIRED",
            message: "Identifiants invalides.",
            correlationId: "test",
          },
        }),
      });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Se connecter" }),
      ).toBeVisible();
    });

    fireEvent.change(screen.getByLabelText("Adresse e-mail"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() => {
      expect(screen.getByText("Identifiants invalides.")).toBeVisible();
    });
  });
});

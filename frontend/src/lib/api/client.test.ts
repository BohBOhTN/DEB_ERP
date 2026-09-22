import { describe, expect, it, vi } from "vitest";
import { ApiClient, onUnauthorized, resolveApiBaseUrl } from "./client.js";
import { ApiError } from "./errors.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ApiClient", () => {
  it("resolves the v1 base URL from the environment", () => {
    expect(resolveApiBaseUrl({})).toBe("/api/v1");
    expect(
      resolveApiBaseUrl({ VITE_API_BASE_URL: "http://localhost:4000/api/" }),
    ).toBe("http://localhost:4000/api/v1");
    expect(
      resolveApiBaseUrl({ VITE_API_V1_BASE_URL: "https://erp.example/api/v1" }),
    ).toBe("https://erp.example/api/v1");
  });

  it("sends the session cookie, a correlation id, and unwraps the envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { customer: { id: "c1" } },
        meta: { correlationId: "x" },
      }),
    );
    const client = new ApiClient("/api/v1", fetchImpl);

    const data = await client.get<{ customer: { id: string } }>(
      "/customers/c1",
      {
        query: { include: "balances", empty: "" },
      },
    );

    expect(data).toEqual({ customer: { id: "c1" } });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/customers/c1?include=balances");
    expect(init.credentials).toBe("include");
    const headers = init.headers as Record<string, string>;
    expect(headers["Accept-Language"]).toBe("fr");
    expect(headers["X-Correlation-Id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sends the idempotency key and the JSON body on a command", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { data: { sale: {} } }));
    const client = new ApiClient("/api/v1", fetchImpl);

    await client.post("/pos/sales", { lines: [] }, { idempotencyKey: "key-1" });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"lines":[]}');
    expect(headers["Idempotency-Key"]).toBe("key-1");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("turns the error envelope into an ApiError with field errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Les données saisies sont invalides.",
          fieldErrors: { name: "Ce champ est obligatoire." },
          correlationId: "corr-1",
        },
      }),
    );
    const client = new ApiClient("/api/v1", fetchImpl);

    const error = await client
      .post("/customers", {})
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      fieldErrors: { name: "Ce champ est obligatoire." },
      correlationId: "corr-1",
      isValidation: true,
    });
  });

  it("notifies the session layer on a 401 and never retries a command", async () => {
    const listener = vi.fn();
    const stop = onUnauthorized(listener);
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(401, {
        error: { code: "AUTHENTICATION_REQUIRED", message: "" },
      }),
    );
    const client = new ApiClient("/api/v1", fetchImpl);

    await expect(client.post("/auth/logout")).rejects.toMatchObject({
      status: 401,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    stop();
  });

  it("retries an idempotent read once on a network failure, then reports it", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(200, { data: { items: [] } }));
    const client = new ApiClient("/api/v1", fetchImpl);

    await expect(client.list("/customers")).resolves.toEqual({ items: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const failing = new ApiClient(
      "/api/v1",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(failing.get("/customers")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      isNetwork: true,
    });
  });
});

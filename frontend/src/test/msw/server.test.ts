import { describe, expect, it } from "vitest";
import { ApiClient } from "../../lib/api/client.js";
import { server } from "./server.js";
import { anonymousHandlers } from "./handlers/auth.js";

const client = new ApiClient("http://localhost/api/v1");

describe("msw test server", () => {
  it("serves the signed-in user and the catalogue page", async () => {
    const me = await client.get<{ user: { displayName: string } }>("/auth/me");
    const page = await client.list<{ name: string }>("/catalog/products", {
      query: { q: "pain", pageSize: 1 },
    });

    expect(me.user.displayName).toBe("Amine Trabelsi");
    expect(page).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      pageCount: 1,
    });
  });

  it("lets a test switch to the anonymous state", async () => {
    server.use(...anonymousHandlers);

    await expect(client.get("/auth/me")).rejects.toMatchObject({ status: 401 });
  });
});

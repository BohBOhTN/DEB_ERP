import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildOpenApiDocument, toJsonSchema } from "./document.js";
import { apiOperations } from "./operations.js";
import { toOpenApiPath } from "./registry.js";

const modulesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../modules",
);
const appSource = fs.readFileSync(
  path.resolve(modulesDir, "../app.ts"),
  "utf8",
);
const routePattern = /router\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g;

function routesOf(routerName: string, prefix: string, into: Set<string>) {
  const source = fs.readFileSync(
    path.join(modulesDir, routerName, `${routerName}.routes.ts`),
    "utf8",
  );

  for (const match of source.matchAll(routePattern)) {
    const routePath = match[2] === "/" ? "" : (match[2] as string);
    into.add(`${match[1]} ${toOpenApiPath(`${prefix}${routePath}`)}`);
  }
}

/// Every `router.<method>("<path>"` in the route files, resolved to its v1
/// path through the mounts written in `app.ts`, so the table cannot drift
/// from the real application.
function mountedRoutes(): Set<string> {
  const routes = new Set<string>();

  for (const match of appSource.matchAll(
    /mount\(\s*"\/api([^"]*)",\s*(\w+)Router\(/g,
  )) {
    routesOf(match[2] as string, match[1] as string, routes);
  }

  for (const match of appSource.matchAll(
    /app\.use\(\s*"\/api\/v1([^"]*)",\s*markApiVersion\(1\),\s*(\w+)Router\(/g,
  )) {
    routesOf(match[2] as string, match[1] as string, routes);
  }

  // The bare `/api` mount hosts several routers in one call.
  const sharedMount = appSource.match(/mount\(\s*"\/api",\s*\[([\s\S]*?)\]/);
  for (const match of (sharedMount?.[1] ?? "").matchAll(/(\w+)Router\(/g)) {
    routesOf(match[1] as string, "", routes);
  }

  return routes;
}

describe("OpenAPI catalogue", () => {
  it("covers every mounted /api/v1 route and nothing else", () => {
    const declared = new Set(
      apiOperations.map((record) => `${record.method} ${record.path}`),
    );
    const mounted = mountedRoutes();

    expect(mounted.size).toBeGreaterThan(100);
    expect([...mounted].filter((route) => !declared.has(route))).toEqual([]);
    expect([...declared].filter((route) => !mounted.has(route))).toEqual([]);
  });

  it("gives every operation a unique id", () => {
    const ids = apiOperations.map((record) => record.operationId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds operations with parameters, bodies, permissions, and responses", () => {
    const document = buildOpenApiDocument();
    const listUsers = document.paths["/access/users"]?.get as {
      parameters: Array<{ name: string; in: string }>;
      "x-permissions": string[];
      security: unknown[];
    };
    const postSale = document.paths["/pos/sales"]?.post as {
      parameters: Array<{ name: string; in: string; required?: boolean }>;
      requestBody: { required: boolean };
      responses: Record<string, unknown>;
    };
    const health = document.paths["/health"]?.get as { security: unknown[] };

    expect(document.openapi).toBe("3.0.3");
    expect(listUsers.parameters.map((item) => item.name)).toEqual(
      expect.arrayContaining(["page", "pageSize", "q", "sort", "isActive"]),
    );
    expect(listUsers["x-permissions"]).toEqual(["users.view"]);
    expect(listUsers.security).toEqual([{ sessionCookie: [] }]);
    expect(postSale.parameters).toEqual([
      expect.objectContaining({ name: "Idempotency-Key", in: "header" }),
    ]);
    expect(postSale.requestBody.required).toBe(true);
    expect(Object.keys(postSale.responses)).toEqual([
      "201",
      "400",
      "401",
      "403",
      "409",
    ]);
    expect(health.security).toEqual([]);
  });

  // Coerced query fields are documented as the type the client sends.
  it("renders coerced and transformed fields on their input side", () => {
    const schema = toJsonSchema(
      z.object({
        page: z.coerce.number().int().positive().default(1),
        amount: z.coerce.number().positive(),
        paidAt: z.coerce.date(),
        isActive: z
          .enum(["true", "false"])
          .transform((value) => value === "true")
          .optional(),
      }),
    );
    const properties = schema.properties as Record<string, { type: string }>;

    expect(properties.page?.type).toBe("integer");
    expect(properties.amount?.type).toBe("number");
    expect(properties.paidAt).toMatchObject({
      type: "string",
      format: "date-time",
    });
    expect(properties.isActive?.type).toBe("string");
  });
});

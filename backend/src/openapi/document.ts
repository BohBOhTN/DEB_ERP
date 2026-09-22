import { z } from "zod";
import type { ApiOperation } from "./registry.js";
import { apiOperations } from "./operations.js";

/// Builds the OpenAPI 3.0 document for `/api/v1` from the operation
/// catalogue. Request schemas are the same Zod objects the routes parse, so
/// the document cannot describe an input the server would reject. Response
/// payloads are typed structurally (envelope, page, error); the per-screen
/// `data` shapes are tightened as each screen is rebuilt (R8, R9).

type JsonSchema = Record<string, unknown>;

export interface OpenApiDocument {
  openapi: "3.0.3";
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string }>;
  paths: Record<string, Record<string, unknown>>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, JsonSchema>;
  };
}

export const apiContractVersion = "1.1.0";

export function buildOpenApiDocument(
  operations: readonly ApiOperation[] = apiOperations,
): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};

  for (const record of operations) {
    const item = (paths[record.path] ??= {});
    item[record.method] = describeOperation(record);
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Dar El Barka API",
      version: apiContractVersion,
      description:
        "Contract of the `/api/v1` prefix. Every response is an envelope `{ data, meta }`; every error is `{ error: { code, message, fieldErrors?, correlationId } }`. Collections are paginated pages; statements are cursor-paged with balances in `meta`.",
    },
    servers: [{ url: "/api/v1", description: "Versioned API" }],
    tags: [...new Set(operations.map((record) => record.tag))].map((name) => ({
      name,
    })),
    paths,
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "deb_session",
          description:
            "HTTP-only session cookie set by `POST /auth/login`. The cookie name follows the server configuration.",
        },
      },
      schemas: componentSchemas(),
    },
  };
}

function describeOperation(record: ApiOperation) {
  const parameters = [
    ...pathParameters(record.path),
    ...queryParameters(record.query),
    ...(record.idempotent ? [idempotencyKeyHeader] : []),
  ];
  const status = record.status ?? 200;
  const responses: Record<string, unknown> = {
    [status]:
      status === 204
        ? { description: "No content" }
        : compact({
            description: "Success",
            headers: record.idempotent
              ? {
                  "Idempotency-Replayed": {
                    description:
                      "`true` when the response is the stored result of an earlier call with the same key.",
                    schema: { type: "string", enum: ["true"] },
                  },
                }
              : undefined,
            content: {
              "application/json": { schema: successSchema(record) },
            },
          }),
  };

  if (record.query || record.body) {
    responses[400] = errorResponse("Validation failed (`VALIDATION_ERROR`).");
  }

  if (!record.public) {
    responses[401] = errorResponse("No valid session.");
  }

  if (record.permissions && record.permissions.length > 0) {
    responses[403] = errorResponse("Permission denied.");
  }

  if (record.path.includes("{")) {
    responses[404] = errorResponse("The target does not exist.");
  }

  if (
    record.idempotent ||
    record.method === "patch" ||
    record.method === "put" ||
    record.method === "delete" ||
    record.body
  ) {
    responses[409] = errorResponse(
      "State, uniqueness, or version conflict (`STATE_CONFLICT`, `VERSION_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, or a business rule code).",
    );
  }

  return compact({
    operationId: record.operationId,
    summary: record.summary,
    tags: [record.tag],
    security: record.public ? [] : [{ sessionCookie: [] }],
    "x-permissions": record.permissions,
    parameters: parameters.length > 0 ? parameters : undefined,
    requestBody: record.body
      ? {
          required: true,
          content: {
            "application/json": { schema: toJsonSchema(record.body) },
          },
        }
      : undefined,
    responses,
  });
}

function successSchema(record: ApiOperation): JsonSchema {
  let data: JsonSchema = {
    type: "object",
    additionalProperties: true,
  };

  if (record.list) {
    data = { $ref: "#/components/schemas/Page" };
  } else if (record.statement) {
    data = {
      type: "object",
      properties: { statement: { $ref: "#/components/schemas/Statement" } },
      required: ["statement"],
    };
  } else if (record.dataKey) {
    data = {
      type: "object",
      properties: {
        [record.dataKey]: { type: "object", additionalProperties: true },
      },
      required: [record.dataKey],
    };
  }

  return {
    type: "object",
    properties: {
      data,
      meta: { $ref: "#/components/schemas/Meta" },
    },
    required: ["data", "meta"],
  };
}

function errorResponse(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
      },
    },
  };
}

const idempotencyKeyHeader = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  description:
    "Client-generated key (UUID recommended). The same key with the same body replays the first result; with another body it is refused.",
  schema: { type: "string", minLength: 8, maxLength: 128 },
};

function pathParameters(path: string) {
  return [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

function queryParameters(query: z.ZodType | undefined) {
  if (!query) {
    return [];
  }

  const schema = toJsonSchema(query);
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((schema.required ?? []) as string[]);

  return Object.entries(properties).map(([name, property]) => {
    const { description, ...rest } = property;

    return compact({
      name,
      in: "query",
      required: required.has(name) ? true : undefined,
      description,
      schema: rest,
    });
  });
}

/// Request schemas are rendered on their input side: a `transform` or a
/// `coerce` documents what the client sends, not what the handler receives.
/// A default computed at parse time (`.default(() => new Date())`) is
/// dropped, otherwise the document would change on every generation.
export function toJsonSchema(schema: z.ZodType): JsonSchema {
  const result = z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io: "input",
    unrepresentable: "any",
    override: (context) => {
      const def = (
        context.zodSchema as unknown as {
          _zod?: {
            def?: {
              type?: string;
              coerce?: boolean;
              checks?: Array<{ _zod?: { def?: { check?: string } } }>;
            };
          };
        }
      )._zod?.def;

      if (!def?.coerce) {
        return;
      }

      if (def.type === "number") {
        const isInteger = def.checks?.some(
          (check) => check._zod?.def?.check === "number_format",
        );
        context.jsonSchema.type = isInteger ? "integer" : "number";
      }

      if (def.type === "date") {
        context.jsonSchema.type = "string";
        context.jsonSchema.format = "date-time";
      }
    },
  }) as JsonSchema;

  delete result.$schema;
  dropComputedDefaults(result);

  return result;
}

function dropComputedDefaults(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(dropComputedDefaults);
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  const record = node as JsonSchema;

  if (record.format === "date-time" && "default" in record) {
    delete record.default;
  }

  Object.values(record).forEach(dropComputedDefaults);
}

function componentSchemas(): Record<string, JsonSchema> {
  return {
    Meta: {
      type: "object",
      properties: { correlationId: { type: "string" } },
      required: ["correlationId"],
    },
    Statement: {
      type: "object",
      description:
        "A cursor-paged ledger statement. `items` are the entries of the page; `meta` carries the balances of the window and the cursor of the next page.",
      properties: {
        items: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        meta: {
          type: "object",
          properties: {
            openingBalanceTnd: {
              type: "string",
              description: "Decimal string",
            },
            closingBalanceTnd: {
              type: "string",
              description: "Decimal string",
            },
            nextCursor: { type: "string", nullable: true },
          },
          required: ["openingBalanceTnd", "closingBalanceTnd", "nextCursor"],
        },
      },
      required: ["items", "meta"],
      additionalProperties: true,
    },
    Page: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        page: { type: "integer" },
        pageSize: { type: "integer" },
        total: { type: "integer" },
        pageCount: { type: "integer" },
      },
      required: ["items", "page", "pageSize", "total", "pageCount"],
    },
    ErrorResponse: {
      type: "object",
      properties: {
        error: {
          type: "object",
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            fieldErrors: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            correlationId: { type: "string" },
          },
          required: ["code", "message", "correlationId"],
        },
      },
      required: ["error"],
    },
  };
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

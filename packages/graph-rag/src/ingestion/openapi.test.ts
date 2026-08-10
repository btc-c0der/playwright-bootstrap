import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestOpenApiContracts } from "./openapi.js";
import type { OpenApiIngestInput } from "./openapi.js";

function input(overrides: Partial<OpenApiIngestInput> = {}): OpenApiIngestInput {
  return {
    serviceName: "orders-service",
    sourceFile: "services/orders/openapi.json",
    document: {
      info: { title: "Orders Service" },
      paths: {
        "/orders": {
          post: { operationId: "createOrder", "x-qaf-writes-to": ["orders"] },
        },
      },
    },
    ...overrides,
  };
}

test("produces a Microservice node and an Endpoint node owned by it", () => {
  const result = ingestOpenApiContracts([input()]);
  const service = result.nodes.find((n) => n.id === "service:orders-service");
  const endpoint = result.nodes.find((n) => n.id === "endpoint:orders-service:POST /orders");

  assert.ok(service);
  assert.equal(service?.type, "Microservice");
  assert.ok(endpoint);
  assert.equal(endpoint?.type, "Endpoint");
  assert.ok(
    result.edges.some(
      (e) => e.from === endpoint?.id && e.to === service?.id && e.type === "DEPENDS_ON",
    ),
    "endpoint depends on its owning service",
  );
});

test("x-qaf-writes-to produces a DBTable node and a WRITES_TO edge from the service", () => {
  const result = ingestOpenApiContracts([input()]);
  assert.ok(result.nodes.some((n) => n.id === "table:orders" && n.type === "DBTable"));
  assert.ok(
    result.edges.some(
      (e) => e.from === "service:orders-service" && e.to === "table:orders" && e.type === "WRITES_TO",
    ),
  );
});

test("root-level x-qaf-depends-on adds a service-to-service DEPENDS_ON edge", () => {
  const result = ingestOpenApiContracts([
    input({
      document: {
        info: { title: "Orders Service" },
        "x-qaf-depends-on": ["payments-service"],
        paths: {},
      },
    }),
  ]);
  assert.ok(
    result.edges.some(
      (e) =>
        e.from === "service:orders-service" &&
        e.to === "service:payments-service" &&
        e.type === "DEPENDS_ON",
    ),
  );
});

test("per-operation x-qaf-depends-on adds an endpoint-level DEPENDS_ON edge", () => {
  const result = ingestOpenApiContracts([
    input({
      document: {
        paths: {
          "/orders": {
            post: { operationId: "createOrder", "x-qaf-depends-on": ["payments-service"] },
          },
        },
      },
    }),
  ]);
  assert.ok(
    result.edges.some(
      (e) =>
        e.from === "endpoint:orders-service:POST /orders" &&
        e.to === "service:payments-service" &&
        e.type === "DEPENDS_ON",
    ),
  );
});

test("non-HTTP-method keys under a path are ignored", () => {
  const result = ingestOpenApiContracts([
    input({
      document: {
        paths: {
          "/orders": {
            get: { operationId: "listOrders" },
            parameters: {} as never, // OpenAPI allows a "parameters" sibling key under a path item, not an operation
          },
        },
      },
    }),
  ]);
  assert.equal(result.nodes.filter((n) => n.type === "Endpoint").length, 1);
});

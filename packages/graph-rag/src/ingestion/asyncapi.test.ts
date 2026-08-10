import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestAsyncApiContracts } from "./asyncapi.js";

test("publish produces a PRODUCES_EVENT edge, subscribe a CONSUMES_EVENT edge", () => {
  const result = ingestAsyncApiContracts([
    {
      serviceName: "orders-service",
      document: { channels: { "orders.created": { publish: { operationId: "onOrderCreated" } } } },
    },
    {
      serviceName: "shipping-service",
      document: { channels: { "orders.created": { subscribe: { operationId: "handleOrderCreated" } } } },
    },
  ]);

  assert.ok(result.nodes.some((n) => n.id === "queue:orders.created" && n.type === "MessageQueue"));
  assert.ok(
    result.edges.some(
      (e) =>
        e.from === "service:orders-service" &&
        e.to === "queue:orders.created" &&
        e.type === "PRODUCES_EVENT",
    ),
  );
  assert.ok(
    result.edges.some(
      (e) =>
        e.from === "service:shipping-service" &&
        e.to === "queue:orders.created" &&
        e.type === "CONSUMES_EVENT",
    ),
  );
});

test("a channel with neither publish nor subscribe still produces the queue node with no edges", () => {
  const result = ingestAsyncApiContracts([
    { serviceName: "orders-service", document: { channels: { "orders.deprecated": {} } } },
  ]);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.edges.length, 0);
});

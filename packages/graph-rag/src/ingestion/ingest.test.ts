import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalGraphStore } from "../graph/local-graph-store.js";
import { ingestAll } from "./ingest.js";

test("merges openapi + asyncapi + testCatalog sources into one store", async () => {
  const store = new LocalGraphStore();
  const summary = await ingestAll(
    {
      openapi: [
        {
          serviceName: "orders-service",
          document: { paths: { "/orders": { post: { operationId: "createOrder" } } } },
        },
      ],
      asyncapi: [
        {
          serviceName: "orders-service",
          document: { channels: { "orders.created": { publish: {} } } },
        },
        {
          serviceName: "shipping-service",
          document: { channels: { "orders.created": { subscribe: {} } } },
        },
      ],
      testCatalog: {
        files: ["orders.spec.ts"],
        readFile: async () =>
          `/** @covers service:orders-service */\ntest("creates an order", async () => {});`,
      },
    },
    store,
  );

  assert.ok(summary.nodesWritten > 0);
  assert.ok(await store.getNode("service:orders-service"));
  assert.ok(await store.getNode("queue:orders.created"));
  // shipping-service only appears via its asyncapi CONSUMES_EVENT edge, never declared by an
  // openapi input in this run — must still exist as a placeholder so the edge isn't dropped.
  const shipping = await store.getNode("service:shipping-service");
  assert.ok(shipping);
  assert.equal(shipping?.metadata.inferred, true);
  assert.ok(summary.inferredNodeIds.includes("service:shipping-service"));
});

test("re-running ingestAll on the same store is idempotent (no duplicate edges)", async () => {
  const store = new LocalGraphStore();
  const sources = {
    openapi: [
      {
        serviceName: "orders-service",
        document: { paths: { "/orders": { get: { operationId: "listOrders" } } } },
      },
    ],
  };
  await ingestAll(sources, store);
  await ingestAll(sources, store);

  const edges = await store.neighbors("endpoint:orders-service:GET /orders", { direction: "out" });
  assert.equal(edges.length, 1);
});

test("an edge endpoint with no recognizable id prefix is dropped, not synthesized as a typed node", async () => {
  const store = new LocalGraphStore();
  const summary = await ingestAll(
    {
      testCatalog: {
        files: ["a.spec.ts"],
        readFile: async () => `/** @covers not-a-known-prefix:foo */\ntest("t", async () => {});`,
      },
    },
    store,
  );
  assert.equal(summary.inferredNodeIds.length, 0);
});

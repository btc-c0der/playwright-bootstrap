import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChangedRefs } from "./pr-diff.js";
import type { GraphNode } from "../graph/types.js";

const NODES: GraphNode[] = [
  { id: "service:orders-service", type: "Microservice", label: "orders-service", metadata: { sourceFile: "services/orders/openapi.json" } },
  { id: "endpoint:orders-service:POST /orders", type: "Endpoint", label: "POST /orders", metadata: { sourceFile: "services/orders/openapi.json" } },
  { id: "service:payments-service", type: "Microservice", label: "payments-service", metadata: { sourceFile: "services/payments/openapi.json" } },
];

test("an explicit node ref resolves directly when the node exists", () => {
  const result = resolveChangedRefs(NODES, ["service:orders-service"]);
  assert.deepEqual(result.nodeIds, ["service:orders-service"]);
  assert.deepEqual(result.unresolved, []);
});

test("a changed file path matches every node whose sourceFile is under it", () => {
  const result = resolveChangedRefs(NODES, ["services/orders/"]);
  assert.deepEqual(
    new Set(result.nodeIds),
    new Set(["service:orders-service", "endpoint:orders-service:POST /orders"]),
  );
});

test("an exact sourceFile match resolves even without a trailing separator", () => {
  const result = resolveChangedRefs(NODES, ["services/payments/openapi.json"]);
  assert.deepEqual(result.nodeIds, ["service:payments-service"]);
});

test("an unresolvable ref is reported, not silently dropped", () => {
  const result = resolveChangedRefs(NODES, ["service:unknown-service", "no/such/path"]);
  assert.deepEqual(result.nodeIds, []);
  assert.deepEqual(result.unresolved, ["service:unknown-service", "no/such/path"]);
});

test("a node ref that parses but doesn't exist in the graph falls back to unresolved, not a crash", () => {
  const result = resolveChangedRefs(NODES, ["service:ghost-service"]);
  assert.deepEqual(result.nodeIds, []);
  assert.deepEqual(result.unresolved, ["service:ghost-service"]);
});

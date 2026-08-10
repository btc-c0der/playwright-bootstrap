import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalGraphStore } from "../graph/local-graph-store.js";
import { analyzeImpact } from "./select-tests.js";

async function buildGraph(): Promise<LocalGraphStore> {
  const store = new LocalGraphStore();
  await store.addNode({
    id: "service:orders-service",
    type: "Microservice",
    label: "orders-service",
    metadata: { sourceFile: "services/orders/openapi.json" },
  });
  await store.addNode({
    id: "service:shipping-service",
    type: "Microservice",
    label: "shipping-service",
    metadata: {},
  });
  await store.addNode({
    id: "service:billing-service",
    type: "Microservice",
    label: "billing-service",
    metadata: {},
  });
  // shipping depends on orders; billing is unrelated
  await store.addEdge({ from: "service:shipping-service", to: "service:orders-service", type: "DEPENDS_ON" });

  await store.addNode({ id: "test:orders-suite", type: "TestCase", label: "orders suite", metadata: {} });
  await store.addNode({ id: "test:shipping-suite", type: "TestCase", label: "shipping suite", metadata: {} });
  await store.addNode({ id: "test:billing-suite", type: "TestCase", label: "billing suite", metadata: {} });
  await store.addEdge({ from: "test:orders-suite", to: "service:orders-service", type: "COVERS_TEST" });
  await store.addEdge({ from: "test:shipping-suite", to: "service:shipping-service", type: "COVERS_TEST" });
  await store.addEdge({ from: "test:billing-suite", to: "service:billing-service", type: "COVERS_TEST" });

  return store;
}

test("selects only the tests covering the seed and its transitively impacted dependents", async () => {
  const store = await buildGraph();
  const result = await analyzeImpact(store, ["service:orders-service"], { maxDepth: 3 });

  assert.deepEqual(new Set(result.selectedTests), new Set(["test:orders-suite", "test:shipping-suite"]));
  assert.equal(result.selectedTests.includes("test:billing-suite"), false);
  assert.deepEqual(result.unresolvedRefs, []);
});

test("a changed ref matching a file path resolves through metadata.sourceFile", async () => {
  const store = await buildGraph();
  const result = await analyzeImpact(store, ["services/orders/openapi.json"], { maxDepth: 3 });
  assert.deepEqual(result.seeds, ["service:orders-service"]);
});

test("an unresolved changed ref is surfaced rather than silently producing an empty selection", async () => {
  const store = await buildGraph();
  const result = await analyzeImpact(store, ["service:does-not-exist"], { maxDepth: 3 });
  assert.deepEqual(result.selectedTests, []);
  assert.deepEqual(result.unresolvedRefs, ["service:does-not-exist"]);
});

test("impactRadiusScore reflects the fraction of system nodes reached", async () => {
  const store = await buildGraph();
  const result = await analyzeImpact(store, ["service:orders-service"], { maxDepth: 3 });
  // 3 Microservice nodes total; orders (seed) + shipping (impacted) = 2/3
  assert.equal(result.impactRadiusScore, Math.round((2 / 3) * 10_000) / 10_000);
});

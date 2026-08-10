import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalGraphStore } from "../graph/local-graph-store.js";
import { computeImpact, computeImpactRadiusScore } from "./traversal.js";

async function service(store: LocalGraphStore, name: string): Promise<string> {
  const id = `service:${name}`;
  await store.addNode({ id, type: "Microservice", label: name, metadata: {} });
  return id;
}

test("DEPENDS_ON propagates impact in reverse: dependents of the changed node are impacted", async () => {
  const store = new LocalGraphStore();
  const a = await service(store, "a");
  const b = await service(store, "b");
  const c = await service(store, "c");
  // b depends on a, c depends on b — changing a should impact b (depth 1) and c (depth 2)
  await store.addEdge({ from: b, to: a, type: "DEPENDS_ON" });
  await store.addEdge({ from: c, to: b, type: "DEPENDS_ON" });

  const result = await computeImpact(store, [a], { maxDepth: 2 });
  const depths = new Map(result.impacted.map((n) => [n.nodeId, n.depth]));
  assert.equal(depths.get(b), 1);
  assert.equal(depths.get(c), 2);
});

test("maxDepth bounds the walk", async () => {
  const store = new LocalGraphStore();
  const a = await service(store, "a");
  const b = await service(store, "b");
  const c = await service(store, "c");
  await store.addEdge({ from: b, to: a, type: "DEPENDS_ON" });
  await store.addEdge({ from: c, to: b, type: "DEPENDS_ON" });

  const result = await computeImpact(store, [a], { maxDepth: 1 });
  assert.equal(result.impacted.some((n) => n.nodeId === c), false);
});

test("a producer's consumers are impacted via the shared queue, with no direct DEPENDS_ON edge", async () => {
  const store = new LocalGraphStore();
  const producer = await service(store, "producer");
  const consumer = await service(store, "consumer");
  const queue = "queue:orders.created";
  await store.addNode({ id: queue, type: "MessageQueue", label: "orders.created", metadata: {} });
  await store.addEdge({ from: producer, to: queue, type: "PRODUCES_EVENT" });
  await store.addEdge({ from: consumer, to: queue, type: "CONSUMES_EVENT" });

  const result = await computeImpact(store, [producer], { maxDepth: 2 });
  const ids = result.impacted.map((n) => n.nodeId);
  assert.ok(ids.includes(queue));
  assert.ok(ids.includes(consumer));
});

test("a co-writer of the same table is impacted, but the changed service's own write doesn't self-impact", async () => {
  const store = new LocalGraphStore();
  const writerA = await service(store, "writer-a");
  const writerB = await service(store, "writer-b");
  const table = "table:orders";
  await store.addNode({ id: table, type: "DBTable", label: "orders", metadata: {} });
  await store.addEdge({ from: writerA, to: table, type: "WRITES_TO" });
  await store.addEdge({ from: writerB, to: table, type: "WRITES_TO" });

  const result = await computeImpact(store, [writerA], { maxDepth: 2 });
  const ids = result.impacted.map((n) => n.nodeId);
  assert.ok(ids.includes(table));
  assert.ok(ids.includes(writerB));
  assert.equal(ids.filter((id) => id === writerA).length, 0, "the seed itself is never re-added as impacted");
});

test("impact_radius_score excludes TestCase/UserStory nodes from the denominator", async () => {
  const store = new LocalGraphStore();
  const a = await service(store, "a");
  const b = await service(store, "b");
  await store.addEdge({ from: b, to: a, type: "DEPENDS_ON" });
  await store.addNode({ id: "test:x", type: "TestCase", label: "x", metadata: {} });
  await store.addNode({ id: "story:JIRA-1", type: "UserStory", label: "JIRA-1", metadata: {} });

  const allNodes = await store.nodes();
  const impact = await computeImpact(store, [a], { maxDepth: 5 });
  // 2 system nodes total (a, b), both impacted (a is a seed, b is impacted) -> score 1
  assert.equal(computeImpactRadiusScore(impact, allNodes), 1);
});

test("impact_radius_score only counts the seed itself when the change has zero dependents", async () => {
  const store = new LocalGraphStore();
  const a = await service(store, "a");
  await service(store, "b"); // unrelated, no edges

  const allNodes = await store.nodes();
  const impact = await computeImpact(store, [a], { maxDepth: 5 });
  // 2 system nodes total (a, b); only the seed (a) counts as impacted -> 0.5, not 0 —
  // the seed itself is always part of the radius even with no propagation.
  assert.equal(computeImpactRadiusScore(impact, allNodes), 0.5);
});

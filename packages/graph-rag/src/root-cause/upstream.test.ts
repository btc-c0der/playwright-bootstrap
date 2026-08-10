import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalGraphStore } from "../graph/local-graph-store.js";
import { findUpstreamCandidates } from "./upstream.js";

async function service(store: LocalGraphStore, name: string): Promise<string> {
  const id = `service:${name}`;
  await store.addNode({ id, type: "Microservice", label: name, metadata: {} });
  return id;
}

test("walks DEPENDS_ON forward: C depends on B depends on A finds A upstream of C", async () => {
  const store = new LocalGraphStore();
  const a = await service(store, "a");
  const b = await service(store, "b");
  const c = await service(store, "c");
  await store.addEdge({ from: c, to: b, type: "DEPENDS_ON" });
  await store.addEdge({ from: b, to: a, type: "DEPENDS_ON" });

  const candidates = await findUpstreamCandidates(store, c, 3);
  const byId = new Map(candidates.map((x) => [x.nodeId, x.depth]));
  assert.equal(byId.get(b), 1);
  assert.equal(byId.get(a), 2);
});

test("maxDepth bounds the upstream walk", async () => {
  const store = new LocalGraphStore();
  const a = await service(store, "a");
  const b = await service(store, "b");
  const c = await service(store, "c");
  await store.addEdge({ from: c, to: b, type: "DEPENDS_ON" });
  await store.addEdge({ from: b, to: a, type: "DEPENDS_ON" });

  const candidates = await findUpstreamCandidates(store, c, 1);
  assert.equal(candidates.some((x) => x.nodeId === a), false);
});

test("a consumer finds its event's producer upstream, with no direct DEPENDS_ON edge", async () => {
  const store = new LocalGraphStore();
  const producer = await service(store, "producer");
  const consumer = await service(store, "consumer");
  const queue = "queue:orders.created";
  await store.addNode({ id: queue, type: "MessageQueue", label: "orders.created", metadata: {} });
  await store.addEdge({ from: producer, to: queue, type: "PRODUCES_EVENT" });
  await store.addEdge({ from: consumer, to: queue, type: "CONSUMES_EVENT" });

  const candidates = await findUpstreamCandidates(store, consumer, 3);
  assert.ok(candidates.some((x) => x.nodeId === producer && x.via === "PRODUCES_EVENT"));
});

test("WRITES_TO is not walked upstream — co-writers are peers, not dependencies", async () => {
  const store = new LocalGraphStore();
  const writerA = await service(store, "writer-a");
  const writerB = await service(store, "writer-b");
  const table = "table:orders";
  await store.addNode({ id: table, type: "DBTable", label: "orders", metadata: {} });
  await store.addEdge({ from: writerA, to: table, type: "WRITES_TO" });
  await store.addEdge({ from: writerB, to: table, type: "WRITES_TO" });

  const candidates = await findUpstreamCandidates(store, writerA, 3);
  assert.equal(candidates.some((x) => x.nodeId === writerB), false);
});

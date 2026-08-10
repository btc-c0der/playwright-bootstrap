import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalGraphStore } from "./local-graph-store.js";
import type { GraphNode } from "./types.js";

function service(id: string): GraphNode {
  return { id, type: "Microservice", label: id, metadata: {} };
}

test("addNode merges metadata into an existing node rather than replacing it", async () => {
  const store = new LocalGraphStore();
  await store.addNode({ id: "service:a", type: "Microservice", label: "a", metadata: { x: 1 } });
  await store.addNode({ id: "service:a", type: "Microservice", label: "a", metadata: { y: 2 } });
  assert.deepEqual(await store.getNode("service:a"), {
    id: "service:a",
    type: "Microservice",
    label: "a",
    metadata: { x: 1, y: 2 },
  });
});

test("addEdge is idempotent by (from, to, type) and merges metadata on re-add", async () => {
  const store = new LocalGraphStore();
  await store.addNode(service("service:a"));
  await store.addNode(service("service:b"));
  await store.addEdge({ from: "service:a", to: "service:b", type: "DEPENDS_ON", metadata: { v: 1 } });
  await store.addEdge({ from: "service:a", to: "service:b", type: "DEPENDS_ON", metadata: { w: 2 } });

  const out = await store.neighbors("service:a", { direction: "out" });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0]?.metadata, { v: 1, w: 2 });
});

test("neighbors respects direction and edgeTypes filters", async () => {
  const store = new LocalGraphStore();
  await store.addNode(service("service:a"));
  await store.addNode(service("service:b"));
  await store.addNode({ id: "queue:q", type: "MessageQueue", label: "q", metadata: {} });
  await store.addEdge({ from: "service:a", to: "service:b", type: "DEPENDS_ON" });
  await store.addEdge({ from: "service:a", to: "queue:q", type: "PRODUCES_EVENT" });

  assert.equal((await store.neighbors("service:a", { direction: "out" })).length, 2);
  assert.equal(
    (await store.neighbors("service:a", { direction: "out", edgeTypes: ["DEPENDS_ON"] })).length,
    1,
  );
  assert.equal((await store.neighbors("service:b", { direction: "in" })).length, 1);
  assert.equal((await store.neighbors("service:b", { direction: "out" })).length, 0);
});

test("traverse does a shortest-path BFS bounded by maxDepth", async () => {
  const store = new LocalGraphStore();
  // a -DEPENDS_ON-> b -DEPENDS_ON-> c -DEPENDS_ON-> d
  for (const id of ["a", "b", "c", "d"]) await store.addNode(service(`service:${id}`));
  await store.addEdge({ from: "service:a", to: "service:b", type: "DEPENDS_ON" });
  await store.addEdge({ from: "service:b", to: "service:c", type: "DEPENDS_ON" });
  await store.addEdge({ from: "service:c", to: "service:d", type: "DEPENDS_ON" });

  const hops = await store.traverse(["service:a"], {
    edgeTypes: ["DEPENDS_ON"],
    direction: "out",
    maxDepth: 2,
  });
  const byId = new Map(hops.map((h) => [h.nodeId, h.depth]));
  assert.equal(byId.get("service:b"), 1);
  assert.equal(byId.get("service:c"), 2);
  assert.equal(byId.has("service:d"), false, "d is 3 hops away, past maxDepth 2");
});

test("save() then load() round-trips the full graph", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "qaf-graph-rag-"));
  try {
    const store = new LocalGraphStore(dir);
    await store.addNode(service("service:a"));
    await store.addNode(service("service:b"));
    await store.addEdge({ from: "service:a", to: "service:b", type: "DEPENDS_ON", metadata: { note: "x" } });
    await store.save();

    const reloaded = new LocalGraphStore(dir);
    await reloaded.load();
    assert.deepEqual(await reloaded.nodes(), await store.nodes());
    assert.deepEqual(await reloaded.neighbors("service:a"), await store.neighbors("service:a"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("load() on a missing file is a no-op, not an error", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "qaf-graph-rag-"));
  try {
    const store = new LocalGraphStore(dir);
    await store.load();
    assert.deepEqual(await store.nodes(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

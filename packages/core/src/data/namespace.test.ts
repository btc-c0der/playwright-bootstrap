import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTestNamespace, buildWorkerNamespace } from "./namespace.js";

test("buildWorkerNamespace is unique across calls even with identical inputs", () => {
  const a = buildWorkerNamespace({ shard: "1", workerIndex: 0 });
  const b = buildWorkerNamespace({ shard: "1", workerIndex: 0 });
  assert.notEqual(a, b);
  assert.match(a, /^1-w0-[0-9a-f]{8}$/);
});

test("buildWorkerNamespace differs across shards for the same workerIndex", () => {
  const a = buildWorkerNamespace({ shard: "1", workerIndex: 0 });
  const b = buildWorkerNamespace({ shard: "2", workerIndex: 0 });
  assert.notEqual(a.split("-")[0], b.split("-")[0]);
});

test("buildTestNamespace is deterministic for the same titlePath + workerNamespace", () => {
  const workerNamespace = "1-w0-aaaaaaaa";
  const a = buildTestNamespace({ workerNamespace, titlePath: ["Suite", "does a thing"] });
  const b = buildTestNamespace({ workerNamespace, titlePath: ["Suite", "does a thing"] });
  assert.equal(a, b);
});

test("buildTestNamespace differs for different titlePaths under the same worker", () => {
  const workerNamespace = "1-w0-aaaaaaaa";
  const a = buildTestNamespace({ workerNamespace, titlePath: ["Suite", "test A"] });
  const b = buildTestNamespace({ workerNamespace, titlePath: ["Suite", "test B"] });
  assert.notEqual(a, b);
});

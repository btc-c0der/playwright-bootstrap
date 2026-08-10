import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LocalJsonlVectorStore } from "./local-jsonl-store.js";
import type { VectorRecord } from "./types.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qaf-rag-store-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function record(overrides: Partial<VectorRecord> = {}): VectorRecord {
  return {
    id: "spec:1",
    namespace: "spec",
    vector: [1, 0, 0],
    metadata: {},
    contentHash: "hash-1",
    embeddingId: "test-model",
    indexedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("upsert then query returns the closest match with its score", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    await store.upsert([
      record({ id: "a", vector: [1, 0, 0] }),
      record({ id: "b", vector: [0, 1, 0] }),
    ]);
    const results = await store.query([1, 0, 0], { namespace: "spec", topK: 1 });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, "a");
    assert.equal(results[0]?.score, 1);
  });
});

test("upsert with an existing id overwrites rather than duplicates", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    await store.upsert([record({ id: "a", contentHash: "old" })]);
    await store.upsert([record({ id: "a", contentHash: "new" })]);
    const all = await store.all("spec");
    assert.equal(all.length, 1);
    assert.equal(all[0]?.contentHash, "new");
  });
});

test("persists across store instances (reads what a previous instance wrote)", async () => {
  await withTempDir(async (dir) => {
    const first = new LocalJsonlVectorStore(dir);
    await first.upsert([record({ id: "a" })]);

    const second = new LocalJsonlVectorStore(dir);
    const all = await second.all("spec");
    assert.equal(all.length, 1);
    assert.equal(all[0]?.id, "a");
  });
});

test("a fresh store instance queries across all on-disk namespaces when none is specified", async () => {
  await withTempDir(async (dir) => {
    const first = new LocalJsonlVectorStore(dir);
    await first.upsert([
      record({ id: "spec:1", namespace: "spec", vector: [1, 0] }),
      record({ id: "test:1", namespace: "test", vector: [0, 1] }),
    ]);

    const second = new LocalJsonlVectorStore(dir);
    const results = await second.query([1, 0], { topK: 5 });
    assert.equal(results.length, 2);
    assert.equal(results[0]?.id, "spec:1");
  });
});

test("delete removes a record by id across namespaces", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    await store.upsert([record({ id: "a" }), record({ id: "b" })]);
    await store.delete(["a"]);
    const all = await store.all("spec");
    assert.deepEqual(
      all.map((r) => r.id),
      ["b"],
    );
  });
});

test("minScore filters out low-similarity matches", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    await store.upsert([
      record({ id: "close", vector: [1, 0] }),
      record({ id: "orthogonal", vector: [0, 1] }),
    ]);
    const results = await store.query([1, 0], { namespace: "spec", topK: 10, minScore: 0.5 });
    assert.deepEqual(
      results.map((r) => r.id),
      ["close"],
    );
  });
});

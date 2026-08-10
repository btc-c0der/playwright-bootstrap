import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { computeSpecToTestMapping } from "./spec-to-test.js";
import { LocalJsonlVectorStore } from "../vector-store/local-jsonl-store.js";
import type { VectorRecord } from "../vector-store/types.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qaf-rag-mapping-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function record(overrides: Partial<VectorRecord>): VectorRecord {
  return {
    id: "id",
    namespace: "spec",
    vector: [1, 0],
    metadata: { title: "title" },
    contentHash: "h",
    embeddingId: "fake",
    indexedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("a spec with a near-identical test vector is classified covered", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    await store.upsert([
      record({
        id: "spec:1",
        namespace: "spec",
        vector: [1, 0],
        metadata: { title: "Login spec" },
      }),
      record({ id: "test:1", namespace: "test", vector: [1, 0], metadata: { title: "logs in" } }),
    ]);

    const result = await computeSpecToTestMapping({ vectorStore: store });
    assert.equal(result.mappings.length, 1);
    assert.equal(result.mappings[0]?.status, "covered");
    assert.equal(result.mappings[0]?.matchedTests[0]?.testId, "test:1");
    assert.equal(result.orphans.length, 0);
  });
});

test("a spec with only a moderately similar test is classified partial", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    await store.upsert([
      record({ id: "spec:1", namespace: "spec", vector: [1, 0] }),
      // cos([1,0],[1,1]) ~= 0.707 -> above default minScore(0.6), below coveredScore(0.8)
      record({ id: "test:1", namespace: "test", vector: [1, 1] }),
    ]);

    const result = await computeSpecToTestMapping({ vectorStore: store });
    assert.equal(result.mappings[0]?.status, "partial");
  });
});

test("a spec with no test above minScore is a gap, and that test is not counted as an orphan match", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    await store.upsert([
      record({ id: "spec:1", namespace: "spec", vector: [1, 0] }),
      record({ id: "test:1", namespace: "test", vector: [0, 1] }), // orthogonal -> score 0
    ]);

    const result = await computeSpecToTestMapping({ vectorStore: store });
    assert.equal(result.mappings[0]?.status, "gap");
    assert.equal(result.mappings[0]?.matchedTests.length, 0);
  });
});

test("a test matched by no spec above minScore is flagged as an orphan", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    await store.upsert([
      record({ id: "spec:1", namespace: "spec", vector: [1, 0] }),
      record({
        id: "test:1",
        namespace: "test",
        vector: [1, 0],
        metadata: { title: "covered test" },
      }),
      record({
        id: "test:2",
        namespace: "test",
        vector: [0, 1],
        metadata: { title: "orphan test" },
      }),
    ]);

    const result = await computeSpecToTestMapping({ vectorStore: store });
    assert.deepEqual(result.orphans, [{ testId: "test:2", testTitle: "orphan test" }]);
  });
});

test("jira and confluence namespaces are also treated as specs by default", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    await store.upsert([
      record({ id: "jira:PROJ-1", namespace: "jira", vector: [1, 0] }),
      record({ id: "test:1", namespace: "test", vector: [1, 0] }),
    ]);

    const result = await computeSpecToTestMapping({ vectorStore: store });
    assert.equal(result.mappings.length, 1);
    assert.equal(result.mappings[0]?.specNamespace, "jira");
  });
});

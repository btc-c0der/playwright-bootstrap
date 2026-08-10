import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { clusterFailure, summarizeClusters } from "./cluster.js";
import { LocalJsonlVectorStore } from "../vector-store/local-jsonl-store.js";
import type { EmbeddingProvider } from "../embedding/types.js";
import type { FailureRecord } from "./types.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qaf-rag-cluster-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Maps a signature string to a fixed vector by exact match, so tests control similarity precisely. */
function providerFor(vectors: Record<string, number[]>): EmbeddingProvider {
  return {
    id: "fake",
    dimensions: 2,
    async embed(texts: string[]) {
      return texts.map((t) => {
        const exact = vectors[t];
        if (exact) return exact;
        // fall back: any unrecognized signature gets an orthogonal vector
        return [0, 1];
      });
    },
  };
}

function failure(overrides: Partial<FailureRecord> = {}): FailureRecord {
  return {
    id: "f1",
    testId: "a.spec.ts::chromium::t",
    file: "a.spec.ts",
    project: "chromium",
    errorMessage: "Timeout waiting for selector",
    stackTrace: "at file.ts:1:1",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("the first occurrence of a signature becomes a new cluster referencing itself", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    const provider = providerFor({});
    const result = await clusterFailure(failure({ id: "f1" }), {
      vectorStore: store,
      embeddingProvider: provider,
    });
    assert.equal(result.isNewCluster, true);
    assert.equal(result.clusterId, "f1");
  });
});

test("a matching subsequent occurrence joins the existing cluster and carries its metadata forward", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    const signature = "Timeout waiting for selector\nfile.ts:<line>:<col>";
    const provider = providerFor({ [signature]: [1, 0] });

    const first = await clusterFailure(failure({ id: "f1" }), {
      vectorStore: store,
      embeddingProvider: provider,
    });
    assert.equal(first.clusterId, "f1");

    const second = await clusterFailure(failure({ id: "f2", stackTrace: "at other.ts:99:9" }), {
      vectorStore: store,
      embeddingProvider: provider,
    });
    // both symbolize to the same signature (line:col stripped), so both embed to [1,0] -> score 1 >= minScore
    assert.equal(second.isNewCluster, false);
    assert.equal(second.clusterId, "f1");
  });
});

test("a dissimilar occurrence starts its own cluster rather than joining an unrelated one", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalJsonlVectorStore(dir);
    const provider: EmbeddingProvider = {
      id: "fake",
      dimensions: 2,
      async embed(texts: string[]) {
        return texts.map((t) => (t.includes("Timeout") ? [1, 0] : [0, 1]));
      },
    };

    await clusterFailure(failure({ id: "f1", errorMessage: "Timeout waiting for selector" }), {
      vectorStore: store,
      embeddingProvider: provider,
    });
    const second = await clusterFailure(
      failure({ id: "f2", errorMessage: "Network request failed" }),
      {
        vectorStore: store,
        embeddingProvider: provider,
      },
    );

    assert.equal(second.isNewCluster, true);
    assert.equal(second.clusterId, "f2");
  });
});

test("summarizeClusters groups by clusterId and counts distinct tests", () => {
  const records = [
    {
      id: "f1",
      namespace: "ci-failure" as const,
      vector: [1, 0],
      metadata: { clusterId: "f1", testId: "a.spec.ts::chromium::t" },
      contentHash: "h1",
      embeddingId: "fake",
      indexedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "f2",
      namespace: "ci-failure" as const,
      vector: [1, 0],
      metadata: { clusterId: "f1", testId: "b.spec.ts::firefox::t" },
      contentHash: "h2",
      embeddingId: "fake",
      indexedAt: "2026-01-02T00:00:00.000Z",
    },
  ];
  const summaries = summarizeClusters(records);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.occurrenceCount, 2);
  assert.deepEqual(summaries[0]?.distinctTestIds.sort(), [
    "a.spec.ts::chromium::t",
    "b.spec.ts::firefox::t",
  ]);
  assert.equal(summaries[0]?.lastSeen, "2026-01-02T00:00:00.000Z");
});

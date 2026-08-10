import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { EmbeddingProvider } from "@qaf/rag-core";
import { LocalGraphStore } from "../graph/local-graph-store.js";
import { LocalIncidentStore } from "./incident-store.js";
import { diagnoseRootCause } from "./diagnose.js";

/** One-hot per marker substring — text containing "MARKER-A" embeds to [1,0], "MARKER-B" to [0,1], anything else to [0,0]. Mirrors `@qaf/rag-core` test doubles' style (e.g. `OneHotEmbeddingProvider`). */
class MarkerEmbeddingProvider implements EmbeddingProvider {
  readonly id = "fake:marker";
  readonly dimensions = 2;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      if (t.includes("MARKER-A")) return [1, 0];
      if (t.includes("MARKER-B")) return [0, 1];
      return [0, 0];
    });
  }
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "qaf-diagnose-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function buildChain(): Promise<LocalGraphStore> {
  const store = new LocalGraphStore();
  await store.addNode({ id: "service:a", type: "Microservice", label: "a", metadata: {} });
  await store.addNode({ id: "service:b", type: "Microservice", label: "b", metadata: {} });
  await store.addNode({ id: "service:c", type: "Microservice", label: "c", metadata: {} });
  // c depends on b depends on a
  await store.addEdge({ from: "service:c", to: "service:b", type: "DEPENDS_ON" });
  await store.addEdge({ from: "service:b", to: "service:a", type: "DEPENDS_ON" });
  return store;
}

test("picks the upstream candidate whose logs match the failure signature over the origin itself", async () => {
  await withTempDir(async (dir) => {
    const store = await buildChain();
    const incidentStore = new LocalIncidentStore(dir);

    const result = await diagnoseRootCause(
      {
        failingNodeId: "service:c",
        stackTrace: "TypeError MARKER-A: contract mismatch",
        timestamp: "2026-01-01T00:00:00Z",
        serviceLogs: { "service:a": "MARKER-A upstream contract violation" },
      },
      { store, incidentStore, embeddingProvider: new MarkerEmbeddingProvider() },
    );

    assert.equal(result.origin_node, "service:c");
    assert.equal(result.root_cause_node, "service:a");
    assert.ok(result.confidence > 40);
    assert.match(result.recommended_action, /"a"/);
  });
});

test("falls back to the origin node when no upstream candidate has any evidence", async () => {
  await withTempDir(async (dir) => {
    const store = await buildChain();
    const incidentStore = new LocalIncidentStore(dir);

    const result = await diagnoseRootCause(
      {
        failingNodeId: "service:c",
        stackTrace: "unrelated failure, no markers here",
        timestamp: "2026-01-01T00:00:00Z",
      },
      { store, incidentStore, embeddingProvider: new MarkerEmbeddingProvider() },
    );

    assert.equal(result.root_cause_node, "service:c");
    assert.equal(result.confidence, 0);
    assert.match(result.recommended_action, /Insufficient evidence/);
  });
});

test("a matching historical incident on an upstream node contributes to its score even with no live logs", async () => {
  await withTempDir(async (dir) => {
    const store = await buildChain();
    const incidentStore = new LocalIncidentStore(dir);
    await incidentStore.upsert([
      {
        id: "past-incident-1",
        nodeId: "service:b",
        summary: "same MARKER-B contract drift, fixed by rolling back service b's deploy",
        vector: [0, 1],
        embeddingId: "fake:marker",
        occurredAt: "2025-06-01T00:00:00Z",
      },
    ]);

    const result = await diagnoseRootCause(
      {
        failingNodeId: "service:c",
        stackTrace: "TypeError MARKER-B: contract mismatch",
        timestamp: "2026-01-01T00:00:00Z",
      },
      { store, incidentStore, embeddingProvider: new MarkerEmbeddingProvider() },
    );

    assert.equal(result.root_cause_node, "service:b");
    assert.equal(result.evidence[0]?.matchedIncidentId, "past-incident-1");
  });
});

test("evidence lists at most the top 3 candidates, most similar first", async () => {
  await withTempDir(async (dir) => {
    const store = await buildChain();
    const incidentStore = new LocalIncidentStore(dir);

    const result = await diagnoseRootCause(
      {
        failingNodeId: "service:c",
        stackTrace: "MARKER-A somewhere in here",
        timestamp: "2026-01-01T00:00:00Z",
        serviceLogs: { "service:a": "MARKER-A" },
      },
      { store, incidentStore, embeddingProvider: new MarkerEmbeddingProvider() },
    );

    assert.ok(result.evidence.length <= 3);
    assert.ok(result.evidence.every((e, i) => i === 0 || e.similarity <= result.evidence[i - 1]!.similarity));
  });
});

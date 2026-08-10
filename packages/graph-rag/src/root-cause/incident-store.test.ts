import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalIncidentStore } from "./incident-store.js";
import type { IncidentRecord } from "./incident-store.js";

function incident(overrides: Partial<IncidentRecord> = {}): IncidentRecord {
  return {
    id: "incident-1",
    nodeId: "service:a",
    summary: "contract mismatch",
    vector: [1, 0],
    embeddingId: "fake:test",
    occurredAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "qaf-incident-store-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("upsert then query returns the nearest match by cosine similarity", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalIncidentStore(dir);
    await store.upsert([
      incident({ id: "a", vector: [1, 0] }),
      incident({ id: "b", vector: [0, 1] }),
    ]);
    const matches = await store.query([1, 0], { topK: 1 });
    assert.equal(matches[0]?.id, "a");
    assert.equal(matches[0]?.score, 1);
  });
});

test("query can be restricted to a specific nodeId", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalIncidentStore(dir);
    await store.upsert([
      incident({ id: "a", nodeId: "service:a", vector: [1, 0] }),
      incident({ id: "b", nodeId: "service:b", vector: [1, 0] }),
    ]);
    const matches = await store.query([1, 0], { topK: 5, nodeId: "service:b" });
    assert.deepEqual(matches.map((m) => m.id), ["b"]);
  });
});

test("upsert is idempotent by id", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalIncidentStore(dir);
    await store.upsert([incident({ id: "a", summary: "first" })]);
    await store.upsert([incident({ id: "a", summary: "second" })]);
    const all = await store.all();
    assert.equal(all.length, 1);
    assert.equal(all[0]?.summary, "second");
  });
});

test("querying an empty store returns no matches, not an error", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalIncidentStore(dir);
    assert.deepEqual(await store.query([1, 0], { topK: 5 }), []);
  });
});

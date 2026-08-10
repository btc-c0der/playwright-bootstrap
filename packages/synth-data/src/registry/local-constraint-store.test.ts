import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LocalConstraintStore } from "./local-constraint-store.js";
import type { ConstraintVectorRecord } from "./types.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qaf-synth-store-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function record(overrides: Partial<ConstraintVectorRecord> = {}): ConstraintVectorRecord {
  return {
    id: "accounts#field:cnpj",
    entityName: "accounts",
    kind: "field",
    rule: {
      id: "accounts#field:cnpj",
      entityName: "accounts",
      kind: "field",
      description: "cnpj is a required string matching ^[0-9]{14}$",
      detail: { name: "cnpj", type: "string", required: true, pattern: "^[0-9]{14}$" },
    },
    vector: [1, 0, 0],
    contentHash: "hash-1",
    embeddingId: "test-model",
    indexedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("upsert then query returns the closest match", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalConstraintStore(dir);
    await store.upsert([
      record({ id: "a", vector: [1, 0, 0] }),
      record({ id: "b", vector: [0, 1, 0] }),
    ]);
    const results = await store.query([1, 0, 0], { topK: 1 });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, "a");
  });
});

test("upsert with an existing id overwrites rather than duplicates", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalConstraintStore(dir);
    await store.upsert([record({ id: "a", contentHash: "old" })]);
    await store.upsert([record({ id: "a", contentHash: "new" })]);
    const all = await store.all();
    assert.equal(all.length, 1);
    assert.equal(all[0]?.contentHash, "new");
  });
});

test("persists across store instances", async () => {
  await withTempDir(async (dir) => {
    await new LocalConstraintStore(dir).upsert([record({ id: "a" })]);
    const all = await new LocalConstraintStore(dir).all();
    assert.equal(all.length, 1);
    assert.equal(all[0]?.id, "a");
  });
});

test("query can be scoped to one entityName", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalConstraintStore(dir);
    await store.upsert([
      record({ id: "a", entityName: "accounts", vector: [1, 0] }),
      record({ id: "b", entityName: "users", vector: [1, 0] }),
    ]);
    const results = await store.query([1, 0], { topK: 10, entityName: "users" });
    assert.deepEqual(results.map((r) => r.id), ["b"]);
  });
});

test("delete removes a record by id", async () => {
  await withTempDir(async (dir) => {
    const store = new LocalConstraintStore(dir);
    await store.upsert([record({ id: "a" }), record({ id: "b" })]);
    await store.delete(["a"]);
    assert.deepEqual((await store.all()).map((r) => r.id), ["b"]);
  });
});

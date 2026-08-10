import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { EmbeddingProvider } from "@qaf/rag-core";
import {
  buildConstraintRegistry,
  deriveConstraintRules,
  reconstructEntitySchemas,
  retrieveConstraints,
} from "./constraint-registry.js";
import { LocalConstraintStore } from "./local-constraint-store.js";
import { emptyEntitySchema } from "../ingestion/types.js";
import type { EntitySchema } from "../ingestion/types.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qaf-synth-registry-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Deterministic per-text vector — bag-of-words-ish so a request sharing
 * vocabulary with a rule's description scores higher, without an actual
 * model. "suspended" is weighted heavily rather than counted like every other
 * word: with dozens of unrelated words diluting a real bag-of-words vector,
 * one shared distinctive term would otherwise get outweighed by sheer word
 * count — a real embedding model captures that a shared domain term like
 * "SUSPENDED" matters more than incidental overlap; this fake stands in for
 * that judgment rather than trying to reproduce it.
 */
function fakeProvider(): EmbeddingProvider & { calls: string[][] } {
  return {
    id: "fake:v1",
    dimensions: 16,
    calls: [] as string[][],
    async embed(texts: string[]) {
      this.calls.push(texts);
      return texts.map((t) => hashVector(t));
    },
  };
}

const HEAVILY_WEIGHTED_WORDS = new Set(["suspended"]);

function hashVector(text: string): number[] {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const dims = 16;
  const vector = new Array(dims).fill(0);
  for (const word of words) {
    const weight = HEAVILY_WEIGHTED_WORDS.has(word) ? 20 : 1;
    let h = 0;
    for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) % dims;
    vector[h] += weight;
  }
  return vector;
}

function accountsSchema(): EntitySchema {
  const schema = emptyEntitySchema("accounts", "postgres-ddl");
  schema.primaryKey = "id";
  schema.fields.push(
    { name: "id", type: "uuid", required: true },
    {
      name: "state_registration_status",
      type: "enum",
      required: true,
      enum: ["ACTIVE", "SUSPENDED", "CANCELLED"],
    },
    { name: "balance", type: "number", required: true, minimum: -100000 },
  );
  schema.foreignKeys.push({ field: "user_id", referencesEntity: "users", referencesField: "id" });
  schema.businessRules.push("a SUSPENDED account may still carry a negative balance");
  return schema;
}

test("deriveConstraintRules produces a summary, field, FK, and business-rule entry", () => {
  const rules = deriveConstraintRules([accountsSchema()]);
  assert.ok(rules.some((r) => r.kind === "entity-summary"));
  assert.ok(rules.some((r) => r.kind === "field" && r.id === "accounts#field:state_registration_status"));
  assert.ok(rules.some((r) => r.kind === "foreign-key" && r.id === "accounts#fk:user_id"));
  assert.ok(rules.some((r) => r.kind === "business-rule"));
});

test("field description mentions enum values so retrieval can match on them", () => {
  const rules = deriveConstraintRules([accountsSchema()]);
  const status = rules.find((r) => r.id === "accounts#field:state_registration_status");
  assert.match(status!.description, /SUSPENDED/);
});

test("buildConstraintRegistry embeds every derived rule on first run", async () => {
  await withTempDir(async (dir) => {
    const provider = fakeProvider();
    const store = new LocalConstraintStore(dir);
    const summary = await buildConstraintRegistry({
      schemas: [accountsSchema()],
      embeddingProvider: provider,
      vectorStore: store,
    });
    assert.equal(summary.embedded, summary.rules);
    assert.equal(summary.skippedUnchanged, 0);
  });
});

test("a second run with an unchanged schema skips re-embedding", async () => {
  await withTempDir(async (dir) => {
    const provider = fakeProvider();
    const store = new LocalConstraintStore(dir);
    await buildConstraintRegistry({ schemas: [accountsSchema()], embeddingProvider: provider, vectorStore: store });
    const second = await buildConstraintRegistry({
      schemas: [accountsSchema()],
      embeddingProvider: provider,
      vectorStore: store,
    });
    assert.equal(second.embedded, 0);
    assert.equal(second.skippedUnchanged, second.rules);
  });
});

test("removing a field from the schema prunes its rule on re-ingest", async () => {
  await withTempDir(async (dir) => {
    const provider = fakeProvider();
    const store = new LocalConstraintStore(dir);
    await buildConstraintRegistry({ schemas: [accountsSchema()], embeddingProvider: provider, vectorStore: store });

    const shrunk = accountsSchema();
    shrunk.fields = shrunk.fields.filter((f) => f.name !== "balance");
    const summary = await buildConstraintRegistry({ schemas: [shrunk], embeddingProvider: provider, vectorStore: store });

    assert.ok(summary.deleted >= 1);
    const all = await store.all("accounts");
    assert.ok(!all.some((r) => r.id === "accounts#field:balance"));
  });
});

test("retrieveConstraints surfaces the field rule whose description shares vocabulary with the request", async () => {
  await withTempDir(async (dir) => {
    const provider = fakeProvider();
    const store = new LocalConstraintStore(dir);
    await buildConstraintRegistry({ schemas: [accountsSchema()], embeddingProvider: provider, vectorStore: store });

    const results = await retrieveConstraints("a SUSPENDED corporate account", provider, store, { topK: 3 });
    assert.ok(results.some((r) => r.id === "accounts#field:state_registration_status"));
  });
});

test("reconstructEntitySchemas is the exact inverse of deriveConstraintRules + a registry round-trip", async () => {
  await withTempDir(async (dir) => {
    const provider = fakeProvider();
    const store = new LocalConstraintStore(dir);
    const original = accountsSchema();
    await buildConstraintRegistry({ schemas: [original], embeddingProvider: provider, vectorStore: store });

    const [reconstructed] = reconstructEntitySchemas(await store.all());
    assert.equal(reconstructed?.name, "accounts");
    assert.equal(reconstructed?.primaryKey, "id");
    assert.deepEqual(
      reconstructed?.fields.map((f) => f.name).sort(),
      original.fields.map((f) => f.name).sort(),
    );
    assert.deepEqual(reconstructed?.foreignKeys, original.foreignKeys);
    assert.deepEqual(reconstructed?.businessRules, original.businessRules);
  });
});

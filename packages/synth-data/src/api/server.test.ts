import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { EmbeddingProvider } from "@qaf/rag-core";
import { createSynthDataServer } from "./server.js";
import { buildConstraintRegistry } from "../registry/constraint-registry.js";
import { LocalConstraintStore } from "../registry/local-constraint-store.js";
import { createSeedTarget, type EntityWriter } from "../seeding/seed-target.js";
import { emptyEntitySchema } from "../ingestion/types.js";
import type { EntitySchema } from "../ingestion/types.js";
import type { LLMProvider } from "../generation/llm-provider.js";
import type { GenerateResponseBody, TeardownResponseBody } from "./types.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qaf-synth-server-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeEmbeddingProvider(): EmbeddingProvider {
  return { id: "fake:v1", dimensions: 1, async embed(texts) { return texts.map(() => [1]); } };
}

function fakeLlmProvider(response: unknown): LLMProvider {
  return { id: "fake-llm", async complete() { return JSON.stringify(response); } };
}

function schemas(): EntitySchema[] {
  const accounts = emptyEntitySchema("accounts", "postgres-ddl");
  accounts.primaryKey = "id";
  accounts.fields.push({ name: "id", type: "uuid", required: true });
  return [accounts];
}

async function withServer(
  overrides: Partial<Parameters<typeof createSynthDataServer>[0]>,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  await withTempDir(async (dir) => {
    const store = new LocalConstraintStore(dir);
    await buildConstraintRegistry({ schemas: schemas(), embeddingProvider: fakeEmbeddingProvider(), vectorStore: store });

    const server = createSynthDataServer({
      entitySchemas: schemas(),
      llmProvider: fakeLlmProvider({ accounts: { id: randomUUID() } }),
      embeddingProvider: fakeEmbeddingProvider(),
      constraintStore: store,
      ...overrides,
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await fn(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}

test("GET /health returns ok", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});

test("POST /generate returns a validated payload and isolation key", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "an account", primaryEntity: "accounts", workerId: "w0" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as GenerateResponseBody;
    assert.equal(body.validation_status, true);
    assert.ok(typeof body.isolation_key === "string" && body.isolation_key.length > 0);
  });
});

test("POST /generate with a missing required field returns 400", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "an account" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /teardown/:isolationKey returns 501 when no SeedTarget is configured", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/teardown/some-key`, { method: "POST" });
    assert.equal(res.status, 501);
  });
});

test("POST /teardown/:isolationKey tears down via the configured SeedTarget", async () => {
  const deleted: string[] = [];
  const writer: EntityWriter = {
    async insert() {},
    async delete(entityName) {
      deleted.push(entityName);
    },
  };
  const seedTarget = createSeedTarget(writer);
  await seedTarget.seed(
    {
      generated_data: { accounts: { id: "a1" } },
      validation_status: true,
      isolation_key: "iso-xyz",
      attempts: 1,
      issues: [],
    },
    schemas(),
  );

  await withServer({ seedTarget }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/teardown/iso-xyz`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = (await res.json()) as TeardownResponseBody;
    assert.equal(body.torn_down, true);
    assert.deepEqual(deleted, ["accounts"]);
  });
});

test("an unknown route returns 404", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/nope`);
    assert.equal(res.status, 404);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { EmbeddingProvider } from "@qaf/rag-core";
import { createSynthDataServer } from "./server.js";
import { createSynthDataClient } from "./client.js";
import { buildConstraintRegistry } from "../registry/constraint-registry.js";
import { LocalConstraintStore } from "../registry/local-constraint-store.js";
import { emptyEntitySchema } from "../ingestion/types.js";
import type { EntitySchema } from "../ingestion/types.js";
import type { LLMProvider } from "../generation/llm-provider.js";

function schemas(): EntitySchema[] {
  const accounts = emptyEntitySchema("accounts", "postgres-ddl");
  accounts.primaryKey = "id";
  accounts.fields.push({ name: "id", type: "uuid", required: true });
  return [accounts];
}

function fakeEmbeddingProvider(): EmbeddingProvider {
  return { id: "fake:v1", dimensions: 1, async embed(texts) { return texts.map(() => [1]); } };
}

function fakeLlmProvider(): LLMProvider {
  return { id: "fake-llm", async complete() { return JSON.stringify({ accounts: { id: randomUUID() } }); } };
}

test("createSynthDataClient round-trips a /generate call against a live server", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qaf-synth-client-"));
  try {
    const store = new LocalConstraintStore(dir);
    await buildConstraintRegistry({ schemas: schemas(), embeddingProvider: fakeEmbeddingProvider(), vectorStore: store });

    const server = createSynthDataServer({
      entitySchemas: schemas(),
      llmProvider: fakeLlmProvider(),
      embeddingProvider: fakeEmbeddingProvider(),
      constraintStore: store,
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const client = createSynthDataClient(`http://127.0.0.1:${port}`);
      const result = await client.generate({ request: "an account", primaryEntity: "accounts", workerId: "w0" });
      assert.equal(result.validation_status, true);

      await assert.rejects(() => client.teardown(result.isolation_key), /No SeedTarget configured/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

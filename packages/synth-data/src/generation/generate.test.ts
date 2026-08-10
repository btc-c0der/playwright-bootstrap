import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { EmbeddingProvider } from "@qaf/rag-core";
import { generateSyntheticPayload } from "./generate.js";
import { buildConstraintRegistry } from "../registry/constraint-registry.js";
import { LocalConstraintStore } from "../registry/local-constraint-store.js";
import { emptyEntitySchema } from "../ingestion/types.js";
import type { EntitySchema } from "../ingestion/types.js";
import type { LLMProvider } from "./llm-provider.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qaf-synth-generate-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeEmbeddingProvider(): EmbeddingProvider {
  return {
    id: "fake:v1",
    dimensions: 1,
    async embed(texts: string[]) {
      return texts.map(() => [1]);
    },
  };
}

function scriptedLlmProvider(responses: string[]): LLMProvider & { prompts: string[] } {
  const prompts: string[] = [];
  let call = 0;
  return {
    id: "fake-llm",
    prompts,
    async complete(prompt: string) {
      prompts.push(prompt);
      const response = responses[Math.min(call, responses.length - 1)];
      call++;
      return response as string;
    },
  };
}

function schemas(): EntitySchema[] {
  const users = emptyEntitySchema("users", "postgres-ddl");
  users.primaryKey = "id";
  users.fields.push({ name: "id", type: "uuid", required: true });

  const accounts = emptyEntitySchema("accounts", "postgres-ddl");
  accounts.primaryKey = "id";
  accounts.fields.push(
    { name: "id", type: "uuid", required: true },
    { name: "user_id", type: "uuid", required: true },
    { name: "status", type: "enum", required: true, enum: ["ACTIVE", "SUSPENDED"] },
  );
  accounts.foreignKeys.push({ field: "user_id", referencesEntity: "users", referencesField: "id" });

  const pixAttempts = emptyEntitySchema("pix_attempts", "postgres-ddl");
  pixAttempts.fields.push({ name: "account_id", type: "uuid", required: true });
  pixAttempts.foreignKeys.push({ field: "account_id", referencesEntity: "accounts", referencesField: "id" });

  // An entirely unrelated entity — must never show up in the accounts prompt.
  const invoices = emptyEntitySchema("invoices", "postgres-ddl");
  invoices.fields.push({ name: "id", type: "uuid", required: true });

  return [users, accounts, pixAttempts, invoices];
}

async function seededStore(dir: string) {
  const store = new LocalConstraintStore(dir);
  await buildConstraintRegistry({ schemas: schemas(), embeddingProvider: fakeEmbeddingProvider(), vectorStore: store });
  return store;
}

test("throws for an unknown primary entity", async () => {
  await withTempDir(async (dir) => {
    const store = await seededStore(dir);
    await assert.rejects(
      () =>
        generateSyntheticPayload({
          request: "req",
          primaryEntity: "does-not-exist",
          entitySchemas: schemas(),
          llmProvider: scriptedLlmProvider(["{}"]),
          embeddingProvider: fakeEmbeddingProvider(),
          constraintStore: store,
          isolationKey: "11111111-1111-1111-1111-111111111111",
        }),
      /Unknown primary entity/,
    );
  });
});

test("returns validation_status: true and the isolation key on a first-try valid payload", async () => {
  await withTempDir(async (dir) => {
    const store = await seededStore(dir);
    const userId = randomUUID();
    const payload = {
      users: { id: userId },
      accounts: { id: randomUUID(), user_id: userId, status: "SUSPENDED" },
    };
    const result = await generateSyntheticPayload({
      request: "a suspended account",
      primaryEntity: "accounts",
      entitySchemas: schemas(),
      llmProvider: scriptedLlmProvider([JSON.stringify(payload)]),
      embeddingProvider: fakeEmbeddingProvider(),
      constraintStore: store,
      isolationKey: "aaaaaaaa-1111-1111-1111-111111111111",
    });

    assert.equal(result.validation_status, true);
    assert.equal(result.attempts, 1);
    assert.equal(result.isolation_key, "aaaaaaaa-1111-1111-1111-111111111111");
    assert.deepEqual(result.generated_data, payload);
  });
});

test("self-corrects: an invalid first attempt retries and succeeds on the second", async () => {
  await withTempDir(async (dir) => {
    const store = await seededStore(dir);
    const userId = randomUUID();
    const accountId = randomUUID();
    const invalid = { accounts: { id: accountId, user_id: userId, status: "DELETED" }, users: { id: userId } };
    const valid = { accounts: { id: accountId, user_id: userId, status: "SUSPENDED" }, users: { id: userId } };
    const llm = scriptedLlmProvider([JSON.stringify(invalid), JSON.stringify(valid)]);

    const result = await generateSyntheticPayload({
      request: "a suspended account",
      primaryEntity: "accounts",
      entitySchemas: schemas(),
      llmProvider: llm,
      embeddingProvider: fakeEmbeddingProvider(),
      constraintStore: store,
      isolationKey: "11111111-1111-1111-1111-111111111111",
    });

    assert.equal(result.validation_status, true);
    assert.equal(result.attempts, 2);
    // the retry prompt must have carried the validation error trace forward
    assert.match(llm.prompts[1] as string, /previous attempt failed/);
    assert.match(llm.prompts[1] as string, /DELETED/);
  });
});

test("gives up after maxRetries and still returns the last (invalid) payload with validation_status: false", async () => {
  await withTempDir(async (dir) => {
    const store = await seededStore(dir);
    const alwaysInvalid = JSON.stringify({ accounts: { status: "DELETED" } });
    const llm = scriptedLlmProvider([alwaysInvalid]);

    const result = await generateSyntheticPayload({
      request: "req",
      primaryEntity: "accounts",
      entitySchemas: schemas(),
      llmProvider: llm,
      embeddingProvider: fakeEmbeddingProvider(),
      constraintStore: store,
      isolationKey: "11111111-1111-1111-1111-111111111111",
      maxRetries: 3,
    });

    assert.equal(result.validation_status, false);
    assert.equal(result.attempts, 4);
    assert.ok(result.issues.length > 0);
  });
});

test("scopes the prompt to the primary entity's FK neighborhood, excluding unrelated entities", async () => {
  await withTempDir(async (dir) => {
    const store = await seededStore(dir);
    const llm = scriptedLlmProvider([JSON.stringify({ accounts: { id: "a1", user_id: "u1", status: "ACTIVE" }, users: { id: "u1" } })]);

    await generateSyntheticPayload({
      request: "req",
      primaryEntity: "accounts",
      entitySchemas: schemas(),
      llmProvider: llm,
      embeddingProvider: fakeEmbeddingProvider(),
      constraintStore: store,
      isolationKey: "11111111-1111-1111-1111-111111111111",
    });

    const prompt = llm.prompts[0] as string;
    assert.match(prompt, /### accounts/);
    assert.match(prompt, /### users/);
    assert.match(prompt, /### pix_attempts/);
    assert.doesNotMatch(prompt, /### invoices/);
  });
});

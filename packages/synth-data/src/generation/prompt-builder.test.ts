import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGenerationPrompt } from "./prompt-builder.js";
import { emptyEntitySchema } from "../ingestion/types.js";
import type { EntitySchema } from "../ingestion/types.js";
import type { ConstraintRule } from "../registry/types.js";

function accountsSchema(): EntitySchema {
  const schema = emptyEntitySchema("accounts", "postgres-ddl");
  schema.primaryKey = "id";
  schema.fields.push(
    { name: "id", type: "uuid", required: true },
    { name: "status", type: "enum", required: true, enum: ["ACTIVE", "SUSPENDED"] },
  );
  schema.foreignKeys.push({ field: "user_id", referencesEntity: "users", referencesField: "id" });
  return schema;
}

function rule(description: string): ConstraintRule {
  return { id: "x", entityName: "accounts", kind: "field", description, detail: { rule: description } };
}

test("includes the request and primary entity verbatim", () => {
  const prompt = buildGenerationPrompt({
    request: "a suspended corporate account",
    primaryEntity: "accounts",
    entitySchemas: [accountsSchema()],
    retrievedConstraints: [],
    isolationKey: "11111111-1111-1111-1111-111111111111",
  });
  assert.match(prompt, /a suspended corporate account/);
  assert.match(prompt, /Primary entity to generate: "accounts"/);
});

test("renders field constraints, foreign keys, and business rules", () => {
  const schema = accountsSchema();
  schema.businessRules.push("a SUSPENDED account may carry a negative balance");
  const prompt = buildGenerationPrompt({
    request: "req",
    primaryEntity: "accounts",
    entitySchemas: [schema],
    retrievedConstraints: [],
    isolationKey: "11111111-1111-1111-1111-111111111111",
  });
  assert.match(prompt, /enum\(ACTIVE\|SUSPENDED\)/);
  assert.match(prompt, /user_id -> users\.id/);
  assert.match(prompt, /a SUSPENDED account may carry a negative balance/);
});

test("includes retrieved constraint descriptions as bullets", () => {
  const prompt = buildGenerationPrompt({
    request: "req",
    primaryEntity: "accounts",
    entitySchemas: [accountsSchema()],
    retrievedConstraints: [rule("accounts.status can be SUSPENDED")],
    isolationKey: "11111111-1111-1111-1111-111111111111",
  });
  assert.match(prompt, /- accounts\.status can be SUSPENDED/);
});

test("embeds the isolation key's short form with a concrete example", () => {
  const prompt = buildGenerationPrompt({
    request: "req",
    primaryEntity: "accounts",
    entitySchemas: [accountsSchema()],
    retrievedConstraints: [],
    isolationKey: "abcdefab-1111-1111-1111-111111111111",
  });
  assert.match(prompt, /abcdefab/);
});

test("omits the correction section on a first attempt but includes it on retry", () => {
  const base = {
    request: "req",
    primaryEntity: "accounts",
    entitySchemas: [accountsSchema()],
    retrievedConstraints: [],
    isolationKey: "11111111-1111-1111-1111-111111111111",
  };
  assert.doesNotMatch(buildGenerationPrompt(base), /previous attempt failed/);

  const retryPrompt = buildGenerationPrompt({
    ...base,
    priorAttempt: {
      payload: { accounts: { status: "DELETED" } },
      validation: { valid: false, issues: [{ field: "accounts[0].status", code: "enum", message: "bad status" }] },
    },
  });
  assert.match(retryPrompt, /previous attempt failed/);
  assert.match(retryPrompt, /bad status/);
});

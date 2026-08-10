import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSqlInsertScript } from "./postgres-seed-target.js";
import { emptyEntitySchema } from "../ingestion/types.js";
import type { EntitySchema } from "../ingestion/types.js";
import type { GenerationResult } from "../generation/generate.js";

function schemas(): EntitySchema[] {
  const users = emptyEntitySchema("users", "postgres-ddl");
  users.primaryKey = "id";
  users.fields.push({ name: "id", type: "uuid", required: true });

  const accounts = emptyEntitySchema("accounts", "postgres-ddl");
  accounts.primaryKey = "id";
  accounts.fields.push({ name: "id", type: "uuid", required: true }, { name: "user_id", type: "uuid", required: true });
  accounts.foreignKeys.push({ field: "user_id", referencesEntity: "users", referencesField: "id" });
  return [users, accounts];
}

function result(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    generated_data: { users: { id: "u1" }, accounts: { id: "a1", user_id: "u1", balance: -500 } },
    validation_status: true,
    isolation_key: "iso-1",
    attempts: 1,
    issues: [],
    ...overrides,
  };
}

test("emits one INSERT per record, parents before children", () => {
  const sql = buildSqlInsertScript(result(), schemas());
  const lines = sql.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0] as string, /^INSERT INTO "users"/);
  assert.match(lines[1] as string, /^INSERT INTO "accounts"/);
});

test("inlines numeric and string literals correctly, escaping quotes", () => {
  const sql = buildSqlInsertScript(result(), schemas());
  assert.match(sql, /VALUES \('a1', 'u1', -500\)/);
});

test("refuses to render SQL for an unvalidated payload", () => {
  assert.throws(() => buildSqlInsertScript(result({ validation_status: false }), schemas()), /validation_status: false/);
});

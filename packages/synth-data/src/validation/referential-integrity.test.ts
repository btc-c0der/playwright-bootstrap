import { test } from "node:test";
import assert from "node:assert/strict";
import { validateForeignKeys } from "./referential-integrity.js";
import { emptyEntitySchema } from "../ingestion/types.js";
import type { EntitySchema } from "../ingestion/types.js";

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

test("passes when the FK value matches a record present in the same tree", async () => {
  const issues = await validateForeignKeys(
    { users: { id: "u1" }, accounts: { id: "a1", user_id: "u1" } },
    schemas(),
  );
  assert.deepEqual(issues, []);
});

test("flags an FK value that matches nothing in the tree and has no external resolver", async () => {
  const issues = await validateForeignKeys(
    { users: { id: "u1" }, accounts: { id: "a1", user_id: "does-not-exist" } },
    schemas(),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "foreign-key");
});

test("an FK to an entity absent from the tree falls back to resolveExternal", async () => {
  const issues = await validateForeignKeys(
    { accounts: { id: "a1", user_id: "existing-in-staging" } },
    schemas(),
    { resolveExternal: async ({ value }) => value === "existing-in-staging" },
  );
  assert.deepEqual(issues, []);
});

test("resolveExternal returning false still flags the FK as unresolvable", async () => {
  const issues = await validateForeignKeys(
    { accounts: { id: "a1", user_id: "ghost" } },
    schemas(),
    { resolveExternal: async () => false },
  );
  assert.equal(issues[0]?.code, "unresolvable-foreign-key");
});

test("a missing/null FK value is not flagged (that's validateFields' job)", async () => {
  const issues = await validateForeignKeys({ accounts: { id: "a1" } }, schemas());
  assert.deepEqual(issues, []);
});

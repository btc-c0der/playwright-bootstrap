import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validatePayload } from "./validate.js";
import { emptyEntitySchema } from "../ingestion/types.js";
import type { EntitySchema } from "../ingestion/types.js";

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
  return [users, accounts];
}

test("a fully valid tree passes with no issues", async () => {
  const userId = randomUUID();
  const result = await validatePayload(
    {
      users: { id: userId },
      accounts: { id: randomUUID(), user_id: userId, status: "SUSPENDED" },
    },
    schemas(),
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test("combines field-level and FK-level issues in one result", async () => {
  const result = await validatePayload(
    {
      users: { id: randomUUID() },
      accounts: { id: randomUUID(), user_id: "no-such-user", status: "DELETED" },
    },
    schemas(),
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === "enum"));
  assert.ok(result.issues.some((i) => i.code === "foreign-key"));
});

test("field issue paths are prefixed with entity name and array index", async () => {
  const result = await validatePayload({ accounts: { status: "DELETED" } }, schemas());
  assert.ok(result.issues.some((i) => i.field === "accounts[0].status"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSeedTarget, topoSortEntities, type EntityWriter } from "./seed-target.js";
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

function fakeWriter() {
  const inserted: Array<{ entityName: string; record: Record<string, unknown> }> = [];
  const deleted: Array<{ entityName: string; primaryKeyValue: unknown }> = [];
  const writer: EntityWriter = {
    async insert(entityName, record) {
      inserted.push({ entityName, record });
    },
    async delete(entityName, _pkField, primaryKeyValue) {
      deleted.push({ entityName, primaryKeyValue });
    },
  };
  return { writer, inserted, deleted };
}

function result(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    generated_data: {
      users: { id: "u1" },
      accounts: { id: "a1", user_id: "u1" },
    },
    validation_status: true,
    isolation_key: "iso-1",
    attempts: 1,
    issues: [],
    ...overrides,
  };
}

test("topoSortEntities orders a referenced entity before its dependent", () => {
  const order = topoSortEntities(schemas());
  assert.ok(order.indexOf("users") < order.indexOf("accounts"));
});

test("topoSortEntities never blocks on a self-referential FK", () => {
  const tree = emptyEntitySchema("categories", "postgres-ddl");
  tree.primaryKey = "id";
  tree.fields.push({ name: "id", type: "uuid", required: true });
  tree.foreignKeys.push({ field: "parent_id", referencesEntity: "categories", referencesField: "id" });
  assert.deepEqual(topoSortEntities([tree]), ["categories"]);
});

test("seed() inserts parents before children", async () => {
  const { writer, inserted } = fakeWriter();
  const target = createSeedTarget(writer);
  await target.seed(result(), schemas());
  assert.deepEqual(inserted.map((i) => i.entityName), ["users", "accounts"]);
});

test("seed() refuses a payload with validation_status: false", async () => {
  const { writer } = fakeWriter();
  const target = createSeedTarget(writer);
  await assert.rejects(() => target.seed(result({ validation_status: false }), schemas()), /validation_status: false/);
});

test("teardown deletes children before parents (LIFO of insertion order)", async () => {
  const { writer, deleted } = fakeWriter();
  const target = createSeedTarget(writer);
  await target.seed(result(), schemas());
  const failures = await target.teardown("iso-1");
  assert.deepEqual(failures, []);
  assert.deepEqual(deleted.map((d) => d.entityName), ["accounts", "users"]);
});

test("teardown for an isolation key with nothing seeded is a no-op", async () => {
  const { writer } = fakeWriter();
  const target = createSeedTarget(writer);
  assert.deepEqual(await target.teardown("never-seeded"), []);
});

test("two isolation keys' seeded data teardown independently", async () => {
  const { writer, deleted } = fakeWriter();
  const target = createSeedTarget(writer);
  await target.seed(result({ isolation_key: "iso-a" }), schemas());
  await target.seed(result({ isolation_key: "iso-b" }), schemas());

  await target.teardown("iso-a");
  assert.equal(deleted.length, 2);

  await target.teardown("iso-b");
  assert.equal(deleted.length, 4);
});

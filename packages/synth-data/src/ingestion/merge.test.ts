import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeEntitySchemas, dedupeForeignKeys } from "./merge.js";
import { emptyEntitySchema } from "./types.js";

test("merges two EntitySchemas of the same name, combining complementary field detail", () => {
  const fromDdl = emptyEntitySchema("accounts", "postgres-ddl");
  fromDdl.fields.push({ name: "cnpj", type: "string", required: true, maxLength: 14 });

  const fromOpenApi = emptyEntitySchema("accounts", "openapi");
  fromOpenApi.fields.push({ name: "cnpj", type: "string", required: false, pattern: "^[0-9]{14}$" });

  const [merged] = mergeEntitySchemas([fromDdl, fromOpenApi]);
  const cnpj = merged?.fields.find((f) => f.name === "cnpj");
  // required: true from the DDL side wins even though the OpenAPI side said false.
  assert.equal(cnpj?.required, true);
  assert.equal(cnpj?.maxLength, 14);
  assert.equal(cnpj?.pattern, "^[0-9]{14}$");
});

test("takes the tighter of two numeric bounds from either side", () => {
  const a = emptyEntitySchema("accounts", "postgres-ddl");
  a.fields.push({ name: "balance", type: "number", required: true, minimum: -1000 });
  const b = emptyEntitySchema("accounts", "openapi");
  b.fields.push({ name: "balance", type: "number", required: true, minimum: -500, maximum: 100000 });

  const [merged] = mergeEntitySchemas([a, b]);
  const balance = merged?.fields.find((f) => f.name === "balance");
  assert.equal(balance?.minimum, -500);
  assert.equal(balance?.maximum, 100000);
});

test("merges foreign keys and business rules without duplicating", () => {
  const a = emptyEntitySchema("accounts", "postgres-ddl");
  a.foreignKeys.push({ field: "user_id", referencesEntity: "users", referencesField: "id" });
  a.businessRules.push("CHECK (balance IS NOT NULL)");
  const b = emptyEntitySchema("accounts", "openapi");
  b.foreignKeys.push({ field: "user_id", referencesEntity: "users", referencesField: "id" });
  b.businessRules.push("CHECK (balance IS NOT NULL)");

  const [merged] = mergeEntitySchemas([a, b]);
  assert.equal(merged?.foreignKeys.length, 1);
  assert.equal(merged?.businessRules.length, 1);
});

test("dedupeForeignKeys collapses identical (field, entity, field) triples", () => {
  const fks = dedupeForeignKeys([
    { field: "user_id", referencesEntity: "users", referencesField: "id" },
    { field: "user_id", referencesEntity: "users", referencesField: "id" },
  ]);
  assert.equal(fks.length, 1);
});

test("distinct entity names are kept separate, not merged", () => {
  const merged = mergeEntitySchemas([
    emptyEntitySchema("users", "postgres-ddl"),
    emptyEntitySchema("accounts", "postgres-ddl"),
  ]);
  assert.equal(merged.length, 2);
});

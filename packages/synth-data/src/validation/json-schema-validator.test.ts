import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validateFields } from "./json-schema-validator.js";
import { emptyEntitySchema } from "../ingestion/types.js";
import type { EntitySchema } from "../ingestion/types.js";

function accountsSchema(): EntitySchema {
  const schema = emptyEntitySchema("accounts", "postgres-ddl");
  schema.fields.push(
    { name: "id", type: "uuid", required: true },
    { name: "cnpj", type: "string", required: true, format: "cnpj" },
    { name: "status", type: "enum", required: true, enum: ["ACTIVE", "SUSPENDED"] },
    { name: "balance", type: "number", required: true, minimum: -100000, maximum: 1_000_000 },
    { name: "region", type: "string", required: true, pattern: "^[A-Z]{2}$" },
    { name: "nickname", type: "string", required: false },
  );
  return schema;
}

test("flags a missing required field", () => {
  const issues = validateFields({}, accountsSchema());
  assert.ok(issues.some((i) => i.field === "id" && i.code === "required"));
});

test("does not flag a missing optional field", () => {
  const issues = validateFields(
    {
      id: randomUUID(),
      cnpj: "11222333000181",
      status: "ACTIVE",
      balance: 0,
      region: "SC",
    },
    accountsSchema(),
  );
  assert.ok(!issues.some((i) => i.field === "nickname"));
  assert.deepEqual(issues, []);
});

test("flags a wrong-type value", () => {
  const issues = validateFields({ balance: "not-a-number" }, accountsSchema());
  assert.ok(issues.some((i) => i.field === "balance" && i.code === "type"));
});

test("flags a value outside the declared enum", () => {
  const issues = validateFields({ status: "DELETED" }, accountsSchema());
  assert.ok(issues.some((i) => i.field === "status" && i.code === "enum"));
});

test("flags a value that fails its regex pattern", () => {
  const issues = validateFields({ region: "SantaCatarina" }, accountsSchema());
  assert.ok(issues.some((i) => i.field === "region" && i.code === "pattern"));
});

test("flags a numeric value outside min/max", () => {
  const issues = validateFields({ balance: -999999 }, accountsSchema());
  assert.ok(issues.some((i) => i.field === "balance" && i.code === "minimum"));
});

test("a type: uuid field is checked against the UUID format implicitly", () => {
  const issues = validateFields({ id: "not-a-uuid" }, accountsSchema());
  assert.ok(issues.some((i) => i.field === "id" && i.code === "format"));
});

test("an explicit format (cnpj) is checked via its dedicated checksum validator", () => {
  const issues = validateFields({ cnpj: "11222333000199" }, accountsSchema());
  assert.ok(issues.some((i) => i.field === "cnpj" && i.code === "format"));
});

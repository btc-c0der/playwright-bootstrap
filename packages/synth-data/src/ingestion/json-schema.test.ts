import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonSchema } from "./json-schema.js";

test("required array marks matching properties as required, others as optional", () => {
  const entity = parseJsonSchema("user", {
    type: "object",
    required: ["email"],
    properties: {
      email: { type: "string", format: "email" },
      nickname: { type: "string" },
    },
  });
  assert.equal(entity.fields.find((f) => f.name === "email")?.required, true);
  assert.equal(entity.fields.find((f) => f.name === "nickname")?.required, false);
});

test("a finite enum becomes type 'enum' regardless of the underlying JSON type", () => {
  const entity = parseJsonSchema("account", {
    properties: { status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] } },
  });
  const status = entity.fields.find((f) => f.name === "status");
  assert.equal(status?.type, "enum");
  assert.deepEqual(status?.enum, ["ACTIVE", "SUSPENDED"]);
});

test("format: uuid / date-time narrow a string field's resolved type", () => {
  const entity = parseJsonSchema("account", {
    properties: {
      id: { type: "string", format: "uuid" },
      createdAt: { type: "string", format: "date-time" },
    },
  });
  assert.equal(entity.fields.find((f) => f.name === "id")?.type, "uuid");
  assert.equal(entity.fields.find((f) => f.name === "createdAt")?.type, "timestamp");
});

test("the x-qaf-references vendor extension produces a ForeignKeyRef", () => {
  const entity = parseJsonSchema("account", {
    properties: {
      userId: { type: "string", format: "uuid", "x-qaf-references": { entity: "users", field: "id" } },
    },
  });
  assert.deepEqual(entity.foreignKeys, [{ field: "userId", referencesEntity: "users", referencesField: "id" }]);
});

test("array items carry a shallow element type", () => {
  const entity = parseJsonSchema("order", {
    properties: { tags: { type: "array", items: { type: "string" } } },
  });
  assert.equal(entity.fields.find((f) => f.name === "tags")?.items?.type, "string");
});

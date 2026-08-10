import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOpenApiSchemas } from "./openapi.js";

test("produces one EntitySchema per components.schemas entry", () => {
  const entities = parseOpenApiSchemas({
    document: {
      components: {
        schemas: {
          User: { type: "object", required: ["email"], properties: { email: { type: "string" } } },
          Account: {
            type: "object",
            properties: {
              userId: { type: "string", format: "uuid", "x-qaf-references": { entity: "User", field: "id" } },
              balance: { type: "number" },
            },
          },
        },
      },
    },
    primaryKeys: { User: "id" },
  });

  assert.equal(entities.length, 2);
  const user = entities.find((e) => e.name === "User");
  const account = entities.find((e) => e.name === "Account");
  assert.equal(user?.primaryKey, "id");
  assert.equal(user?.sourceKind, "openapi");
  assert.deepEqual(account?.foreignKeys, [{ field: "userId", referencesEntity: "User", referencesField: "id" }]);
});

test("returns an empty list when the document declares no component schemas", () => {
  assert.deepEqual(parseOpenApiSchemas({ document: {} }), []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMongoJsonSchema } from "./mongo-schema.js";

test("maps bsonType to this package's FieldType set", () => {
  const entity = parseMongoJsonSchema({
    collectionName: "accounts",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["cnpj", "balance"],
        properties: {
          cnpj: { bsonType: "string", pattern: "^[0-9]{14}$" },
          balance: { bsonType: "decimal" },
          userId: { bsonType: "objectId", "x-qaf-references": { entity: "users", field: "_id" } },
        },
      },
    },
  });

  assert.equal(entity.name, "accounts");
  assert.equal(entity.sourceKind, "mongo-schema");
  assert.equal(entity.fields.find((f) => f.name === "cnpj")?.required, true);
  assert.equal(entity.fields.find((f) => f.name === "cnpj")?.pattern, "^[0-9]{14}$");
  assert.equal(entity.fields.find((f) => f.name === "balance")?.type, "number");
  assert.equal(entity.fields.find((f) => f.name === "userId")?.type, "uuid");
  assert.deepEqual(entity.foreignKeys, [{ field: "userId", referencesEntity: "users", referencesField: "_id" }]);
});

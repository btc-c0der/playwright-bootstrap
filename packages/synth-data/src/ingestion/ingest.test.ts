import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestAll } from "./ingest.js";

const DDL = `
CREATE TYPE state_registration_status AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');
CREATE TABLE users (
  id UUID PRIMARY KEY,
  region VARCHAR(2) NOT NULL CHECK (region IN ('SC', 'SP'))
);
CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  state_registration_status state_registration_status NOT NULL
);
`;

test("ingests Postgres DDL, Mongo, OpenAPI, and JSON Schema sources into one merged schema set", () => {
  const summary = ingestAll({
    postgresDdl: [DDL],
    mongoCollections: [
      {
        collectionName: "pix_attempts",
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["accountId", "status"],
            properties: {
              accountId: { bsonType: "objectId" },
              status: { bsonType: "string", enum: ["FAILED", "SUCCEEDED"] },
            },
          },
        },
      },
    ],
    openApiDocuments: [
      {
        document: {
          components: {
            schemas: {
              Account: {
                properties: { balance: { type: "number" } },
              },
            },
          },
        },
      },
    ],
  });

  assert.equal(summary.entityCount, 4); // users, accounts, pix_attempts, Account
  assert.ok(summary.fieldCount > 0);
  assert.ok(summary.foreignKeyCount >= 1);

  const accounts = summary.schemas.find((s) => s.name === "accounts");
  assert.equal(accounts?.fields.find((f) => f.name === "state_registration_status")?.type, "enum");
});

test("an empty IngestSources produces an empty, but valid, summary", () => {
  const summary = ingestAll({});
  assert.deepEqual(summary, { schemas: [], entityCount: 0, fieldCount: 0, foreignKeyCount: 0 });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePostgresDdl } from "./postgres-ddl.js";

const DDL = `
CREATE TYPE state_registration_status AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  region VARCHAR(2) NOT NULL CHECK (region IN ('SC', 'SP', 'RJ', 'PR'))
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  cnpj VARCHAR(14) NOT NULL CHECK (cnpj ~ '^[0-9]{14}$'),
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  state_registration_status state_registration_status NOT NULL DEFAULT 'ACTIVE',
  failed_pix_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES users(id),
  CHECK (failed_pix_attempts >= 0)
);
`;

test("parses CREATE TYPE ... AS ENUM into an enum field", () => {
  const [users] = parsePostgresDdl(DDL);
  const region = users?.fields.find((f) => f.name === "region");
  assert.deepEqual(region?.enum, ["SC", "SP", "RJ", "PR"]);
});

test("parses column-level CHECK IN(...) into an enum on the users table", () => {
  const [users] = parsePostgresDdl(DDL);
  assert.equal(users?.name, "users");
  const email = users?.fields.find((f) => f.name === "email");
  assert.equal(email?.type, "string");
  assert.equal(email?.required, true);
  assert.equal(email?.maxLength, 255);
});

test("resolves an inline REFERENCES type name to an enum declared via CREATE TYPE", () => {
  const [, accounts] = parsePostgresDdl(DDL);
  const status = accounts?.fields.find((f) => f.name === "state_registration_status");
  assert.equal(status?.type, "enum");
  assert.deepEqual(status?.enum, ["ACTIVE", "SUSPENDED", "CANCELLED"]);
});

test("parses a column-level CHECK regex into a pattern constraint", () => {
  const [, accounts] = parsePostgresDdl(DDL);
  const cnpj = accounts?.fields.find((f) => f.name === "cnpj");
  assert.equal(cnpj?.pattern, "^[0-9]{14}$");
});

test("captures both inline and table-level FOREIGN KEY constraints", () => {
  const [, accounts] = parsePostgresDdl(DDL);
  assert.equal(accounts?.foreignKeys.length, 1);
  assert.deepEqual(accounts?.foreignKeys[0], {
    field: "user_id",
    referencesEntity: "users",
    referencesField: "id",
  });
});

test("records a table-level CHECK with no recognized shape as a free-text business rule", () => {
  const [, accounts] = parsePostgresDdl(DDL);
  assert.ok(accounts?.businessRules.some((r) => r.includes("failed_pix_attempts >= 0")));
});

test("maps PRIMARY KEY column to primaryKey and required", () => {
  const [users] = parsePostgresDdl(DDL);
  const id = users?.fields.find((f) => f.name === "id");
  assert.equal(id?.type, "uuid");
  assert.equal(id?.required, true);
});

test("ignores statements with no constraint information (e.g. CREATE INDEX)", () => {
  const schemas = parsePostgresDdl(`${DDL}\nCREATE INDEX idx_accounts_user_id ON accounts (user_id);`);
  assert.equal(schemas.length, 2);
});

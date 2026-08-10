import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNoDeniedValues, assertSyntheticSource, ProductionDataGuardError } from "./pii-guard.js";

test("assertSyntheticSource throws for a source labeled as a production sample", () => {
  assert.throws(
    () => assertSyntheticSource({ origin: "production-sample", description: "prod-dump.sql" }),
    ProductionDataGuardError,
  );
});

test("assertSyntheticSource is a no-op for schema-definition and unknown origins", () => {
  assert.doesNotThrow(() => assertSyntheticSource({ origin: "schema-definition" }));
  assert.doesNotThrow(() => assertSyntheticSource({ origin: "unknown" }));
});

test("assertNoDeniedValues is a no-op when nothing in the payload matches the denylist", () => {
  assert.doesNotThrow(() =>
    assertNoDeniedValues({ cnpj: "11222333000181" }, { denylist: ["11144477735"] }),
  );
});

test("assertNoDeniedValues throws when a nested string leaf matches, formatting differences included", () => {
  assert.throws(
    () =>
      assertNoDeniedValues(
        { accounts: { cnpj: "111.444.777-35" } },
        { denylist: ["11144477735"] },
      ),
    ProductionDataGuardError,
  );
});

test("assertNoDeniedValues scans arrays of records too", () => {
  assert.throws(
    () =>
      assertNoDeniedValues(
        { pix_attempts: [{ note: "ok" }, { note: "real-value" }] },
        { denylist: ["real-value"] },
      ),
    ProductionDataGuardError,
  );
});

test("an empty denylist never throws", () => {
  assert.doesNotThrow(() => assertNoDeniedValues({ anything: "111.444.777-35" }, { denylist: [] }));
});

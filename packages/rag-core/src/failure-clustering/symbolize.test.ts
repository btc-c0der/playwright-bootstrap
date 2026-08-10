import { test } from "node:test";
import assert from "node:assert/strict";
import { symbolizeFailure } from "./symbolize.js";
import type { FailureRecord } from "./types.js";

function record(overrides: Partial<FailureRecord> = {}): FailureRecord {
  return {
    id: "id",
    testId: "a.spec.ts::chromium::t",
    file: "a.spec.ts",
    project: "chromium",
    errorMessage: "Timeout waiting for selector",
    stackTrace: "at /Users/dev/project/tests/web/auth.spec.ts:42:17",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("two occurrences differing only in line number produce the same signature", () => {
  const a = symbolizeFailure(
    record({ stackTrace: "at /Users/dev/project/tests/web/auth.spec.ts:42:17" }),
  );
  const b = symbolizeFailure(
    record({ stackTrace: "at /home/ci/repo/tests/web/auth.spec.ts:99:3" }),
  );
  assert.equal(a, b);
});

test("timestamps are stripped so occurrences at different times still match", () => {
  const text = symbolizeFailure(
    record({ errorMessage: "Request failed at 2026-08-09T12:00:00.000Z with status 500" }),
  );
  assert.doesNotMatch(text, /2026-08-09/);
  assert.match(text, /<timestamp>/);
});

test("UUIDs are stripped", () => {
  const text = symbolizeFailure(
    record({ errorMessage: "Resource 550e8400-e29b-41d4-a716-446655440000 not found" }),
  );
  assert.doesNotMatch(text, /550e8400/);
  assert.match(text, /<uuid>/);
});

test("hex memory addresses are stripped", () => {
  const text = symbolizeFailure(record({ stackTrace: "at 0x7ffeef1a2b30 in native code" }));
  assert.doesNotMatch(text, /0x7ffeef1a2b30/);
  assert.match(text, /<addr>/);
});

test("distinct error messages remain distinct after symbolization", () => {
  const a = symbolizeFailure(record({ errorMessage: "expected status 200 but got 500" }));
  const b = symbolizeFailure(record({ errorMessage: "element not found: [data-testid=submit]" }));
  assert.notEqual(a, b);
});

test("plain numeric assertion values are preserved, not stripped as noise", () => {
  const text = symbolizeFailure(record({ errorMessage: "expected 3 but got 5" }));
  assert.match(text, /expected 3 but got 5/);
});

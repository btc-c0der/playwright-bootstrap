import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isEmail, isRfc3339Timestamp, isUuid } from "./format-validators.js";

test("isRfc3339Timestamp accepts a Zulu and an offset timestamp", () => {
  assert.equal(isRfc3339Timestamp("2026-08-09T12:30:00Z"), true);
  assert.equal(isRfc3339Timestamp("2026-08-09T12:30:00.123-03:00"), true);
});

test("isRfc3339Timestamp rejects a calendar-invalid date despite matching the pattern", () => {
  assert.equal(isRfc3339Timestamp("2026-02-30T00:00:00Z"), false);
});

test("isRfc3339Timestamp rejects a non-RFC3339 shape", () => {
  assert.equal(isRfc3339Timestamp("2026-08-09 12:30:00"), false);
  assert.equal(isRfc3339Timestamp("08/09/2026"), false);
});

test("isUuid accepts a real randomUUID() value", () => {
  assert.equal(isUuid(randomUUID()), true);
});

test("isUuid rejects a wrong-shape or wrong-variant string", () => {
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid("00000000-0000-0000-0000-000000000000"), false); // variant nibble is 0, not 8-b
});

test("isEmail sanity-checks basic shape", () => {
  assert.equal(isEmail("user@example.test"), true);
  assert.equal(isEmail("not-an-email"), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "./parse-llm-json.js";

test("parses plain JSON with no wrapping", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

test("strips a ```json ... ``` code fence", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
});

test("strips a bare ``` ... ``` code fence", () => {
  assert.deepEqual(extractJson('```\n{"a":1}\n```'), { a: 1 });
});

test("discards leading/trailing prose around the JSON", () => {
  assert.deepEqual(extractJson('Sure, here is the payload:\n{"a":1}\nLet me know if you need changes.'), {
    a: 1,
  });
});

test("does not miscount braces/brackets that appear inside string values", () => {
  assert.deepEqual(extractJson('{"note": "a {tricky} [string]", "n": 1}'), {
    note: "a {tricky} [string]",
    n: 1,
  });
});

test("handles a top-level JSON array", () => {
  assert.deepEqual(extractJson("[1, 2, 3]"), [1, 2, 3]);
});

test("throws a descriptive error for genuinely unparseable output", () => {
  assert.throws(() => extractJson("not json at all"), /Could not parse JSON/);
});

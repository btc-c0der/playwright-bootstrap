import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWithSelfCorrection } from "./self-correct.js";
import type { ValidationResult } from "./types.js";

function ok(): ValidationResult {
  return { valid: true, issues: [] };
}

function fail(message: string): ValidationResult {
  return { valid: false, issues: [{ code: "required", message }] };
}

test("returns after the first attempt when it already validates", async () => {
  const produce = async () => ({ n: 1 });
  const result = await generateWithSelfCorrection({ produce, validate: () => ok() });
  assert.equal(result.attempts, 1);
  assert.equal(result.validation.valid, true);
});

test("retries up to maxRetries, feeding the prior payload/validation forward", async () => {
  const seen: number[] = [];
  const produce = async (ctx: { attempt: number; priorPayload?: { n: number } }) => {
    seen.push(ctx.attempt);
    return { n: ctx.priorPayload ? ctx.priorPayload.n + 1 : 0 };
  };
  const validate = (payload: { n: number }) => (payload.n >= 2 ? ok() : fail(`n is only ${payload.n}`));

  const result = await generateWithSelfCorrection({ produce, validate, maxRetries: 3 });
  assert.equal(result.payload.n, 2);
  assert.equal(result.attempts, 3);
  assert.deepEqual(seen, [1, 2, 3]);
});

test("stops after maxRetries and returns the last (still-invalid) attempt rather than throwing", async () => {
  const produce = async () => ({ n: 0 });
  const result = await generateWithSelfCorrection({ produce, validate: () => fail("never valid"), maxRetries: 3 });
  assert.equal(result.attempts, 4); // 1 initial + 3 retries
  assert.equal(result.validation.valid, false);
});

test("defaults maxRetries to 3", async () => {
  let calls = 0;
  const produce = async () => {
    calls++;
    return {};
  };
  await generateWithSelfCorrection({ produce, validate: () => fail("always fails") });
  assert.equal(calls, 4);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createIsolationContext, scopeUniqueValue } from "./isolation-key.js";
import { isUuid } from "../validation/format-validators.js";

test("createIsolationContext returns a real UUID as isolationKey", () => {
  const ctx = createIsolationContext({ workerId: "w0", runId: "shard-1" });
  assert.equal(isUuid(ctx.isolationKey), true);
  assert.equal(ctx.workerId, "w0");
  assert.equal(ctx.runId, "shard-1");
});

test("two contexts for the same worker never collide", () => {
  const a = createIsolationContext({ workerId: "w0" });
  const b = createIsolationContext({ workerId: "w0" });
  assert.notEqual(a.isolationKey, b.isolationKey);
});

test("scopeUniqueValue folds the isolation key's short form into a base value", () => {
  const ctx = createIsolationContext({ workerId: "w0" });
  const scoped = scopeUniqueValue(ctx.isolationKey, "user");
  assert.equal(scoped, `user.${ctx.isolationKey.slice(0, 8)}`);
});

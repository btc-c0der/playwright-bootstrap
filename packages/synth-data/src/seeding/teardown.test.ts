import { test } from "node:test";
import assert from "node:assert/strict";
import { IsolationTeardownStack } from "./teardown.js";

test("tears down in LIFO order", async () => {
  const stack = new IsolationTeardownStack();
  const order: string[] = [];
  stack.track({ type: "users", id: "u1", deleteFn: async () => void order.push("users") });
  stack.track({ type: "accounts", id: "a1", deleteFn: async () => void order.push("accounts") });
  await stack.runAll();
  assert.deepEqual(order, ["accounts", "users"]);
});

test("a failed delete is recorded, not thrown, and doesn't stop the rest from running", async () => {
  const stack = new IsolationTeardownStack();
  const order: string[] = [];
  stack.track({ type: "users", id: "u1", deleteFn: async () => void order.push("users") });
  stack.track({
    type: "accounts",
    id: "a1",
    deleteFn: async () => {
      throw new Error("boom");
    },
  });
  await stack.runAll();
  assert.deepEqual(order, ["users"]);
  assert.equal(stack.failures.length, 1);
  assert.equal(stack.failures[0]?.error, "boom");
});

test("size reflects tracked-but-not-yet-torn-down resources", () => {
  const stack = new IsolationTeardownStack();
  stack.track({ type: "users", id: "u1", deleteFn: async () => {} });
  assert.equal(stack.size, 1);
});

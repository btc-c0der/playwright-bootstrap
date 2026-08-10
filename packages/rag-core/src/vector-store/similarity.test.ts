import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity } from "./similarity.js";

test("identical vectors score 1", () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
});

test("orthogonal vectors score 0", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("opposite vectors score -1", () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test("a zero vector scores 0 rather than NaN", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test("scale-invariant: parallel vectors of different magnitude still score 1", () => {
  assert.ok(Math.abs(cosineSimilarity([2, 0], [10, 0]) - 1) < 1e-9);
});

test("throws on dimension mismatch rather than silently truncating", () => {
  assert.throws(() => cosineSimilarity([1, 2, 3], [1, 2]));
});

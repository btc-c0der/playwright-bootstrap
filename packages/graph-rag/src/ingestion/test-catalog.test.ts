import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestTestCatalog } from "./test-catalog.js";

const SPEC_SOURCE = `
import { test } from "@playwright/test";

/**
 * @covers service:orders-service
 * @covers endpoint:orders-service:POST /orders
 * @covers story:JIRA-123
 */
test("creates an order", async ({ page }) => {
  await page.goto("/orders/new");
});

test("lists orders", { tag: ["@smoke", "@covers:endpoint:orders-service:GET /orders"] }, async ({ page }) => {
  await page.goto("/orders");
});

test("has no covers directive at all", async () => {
  // nothing to see here
});
`;

test("JSDoc @covers directives resolve into COVERS_TEST edges", async () => {
  const result = await ingestTestCatalog({
    files: ["orders.spec.ts"],
    readFile: async () => SPEC_SOURCE,
  });

  const testNode = result.nodes.find((n) => n.label === "creates an order");
  assert.ok(testNode);
  assert.equal(testNode?.type, "TestCase");

  const targets = result.edges.filter((e) => e.from === testNode?.id).map((e) => e.to);
  assert.deepEqual(new Set(targets), new Set([
    "service:orders-service",
    "endpoint:orders-service:POST /orders",
    "story:JIRA-123",
  ]));
});

test("inline @covers: tag directives resolve alongside non-covers tags", async () => {
  const result = await ingestTestCatalog({
    files: ["orders.spec.ts"],
    readFile: async () => SPEC_SOURCE,
  });

  const testNode = result.nodes.find((n) => n.label === "lists orders");
  assert.ok(testNode);
  const targets = result.edges.filter((e) => e.from === testNode?.id).map((e) => e.to);
  assert.deepEqual(targets, ["endpoint:orders-service:GET /orders"]);
});

test("a test with no @covers directive still becomes a TestCase node with zero COVERS_TEST edges", async () => {
  const result = await ingestTestCatalog({
    files: ["orders.spec.ts"],
    readFile: async () => SPEC_SOURCE,
  });

  const testNode = result.nodes.find((n) => n.label === "has no covers directive at all");
  assert.ok(testNode);
  assert.equal(result.edges.filter((e) => e.from === testNode?.id).length, 0);
});

test("TestCase node id is stable across files (same title, different file)", async () => {
  const result = await ingestTestCatalog({
    files: ["a.spec.ts", "b.spec.ts"],
    readFile: async (file) => `test("shared title", async () => {}); // ${file}`,
  });
  const ids = result.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, 2, "same title in two files must produce two distinct node ids");
});

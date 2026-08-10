import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { analyzeFlakiness } from "./flaky-report.js";
import type { TestRunRecord } from "../quarantine/reporter.js";

function record(overrides: Partial<TestRunRecord>): TestRunRecord {
  return {
    id: "a.spec.ts::chromium::flaky test",
    file: "a.spec.ts",
    project: "chromium",
    status: "passed",
    retry: 0,
    durationMs: 100,
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("flags a test failing >= threshold within the trailing window", async () => {
  const path = "./history.test.jsonl";
  const records = [
    record({ status: "failed" }),
    record({ status: "failed" }),
    record({ retry: 1, status: "passed" }), // counts as a failure occurrence
    record({ status: "passed" }),
  ];
  await writeFile(path, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");

  const candidates = await analyzeFlakiness(path, { window: 20, failureThreshold: 3 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.failures, 3);

  await rm(path, { force: true });
});

test("does not flag a test under the failure threshold", async () => {
  const path = "./history-clean.test.jsonl";
  const records = [record({ status: "passed" }), record({ status: "failed" }), record({ status: "passed" })];
  await writeFile(path, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");

  const candidates = await analyzeFlakiness(path, { window: 20, failureThreshold: 3 });
  assert.equal(candidates.length, 0);

  await rm(path, { force: true });
});

test("returns no candidates when the history file doesn't exist", async () => {
  const candidates = await analyzeFlakiness("./does-not-exist.jsonl");
  assert.deepEqual(candidates, []);
});

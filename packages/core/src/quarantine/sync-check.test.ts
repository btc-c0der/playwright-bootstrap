import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSync } from "./sync-check.js";
import { emptyManifest } from "./manifest.js";

test("passes when every tagged test has a matching manifest entry and vice versa", () => {
  const manifest = emptyManifest({ maxCount: 50, maxPercent: 5 });
  manifest.entries.push({
    id: "a.spec.ts::chromium-quarantine::flaky test @quarantined",
    file: "a.spec.ts",
    project: "chromium-quarantine",
    status: "quarantined",
    reason: "flaky",
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastFailure: "2026-01-01T00:00:00.000Z",
    quarantinedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    renewalCount: 0,
  });

  const result = checkSync(manifest, [
    { id: "a.spec.ts::chromium-quarantine::flaky test @quarantined", file: "a.spec.ts", project: "chromium-quarantine" },
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.taggedWithoutEntry, []);
  assert.deepEqual(result.entryWithoutTag, []);
});

test("flags a @quarantined-tagged test with no manifest entry", () => {
  const manifest = emptyManifest({ maxCount: 50, maxPercent: 5 });
  const result = checkSync(manifest, [
    { id: "untracked.spec.ts::chromium-quarantine::oops @quarantined", file: "untracked.spec.ts", project: "chromium-quarantine" },
  ]);

  assert.equal(result.passed, false);
  assert.equal(result.taggedWithoutEntry.length, 1);
});

test("flags a manifest entry with no matching tagged test in source", () => {
  const manifest = emptyManifest({ maxCount: 50, maxPercent: 5 });
  manifest.entries.push({
    id: "stale.spec.ts::chromium-quarantine::removed test @quarantined",
    file: "stale.spec.ts",
    project: "chromium-quarantine",
    status: "quarantined",
    reason: "flaky",
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastFailure: "2026-01-01T00:00:00.000Z",
    quarantinedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    renewalCount: 0,
  });

  const result = checkSync(manifest, []);

  assert.equal(result.passed, false);
  assert.equal(result.entryWithoutTag.length, 1);
});

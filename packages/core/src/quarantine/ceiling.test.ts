import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCeiling } from "./ceiling.js";
import { emptyManifest, type QuarantineEntry } from "./manifest.js";

function entry(overrides: Partial<QuarantineEntry> = {}): QuarantineEntry {
  return {
    id: "file.spec.ts::chromium::a test",
    file: "file.spec.ts",
    project: "chromium",
    status: "quarantined",
    reason: "flaky",
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastFailure: "2026-01-01T00:00:00.000Z",
    quarantinedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    renewalCount: 0,
    ...overrides,
  };
}

test("passes when under both count and percent ceilings", () => {
  const manifest = emptyManifest({ maxCount: 50, maxPercent: 5 });
  manifest.entries.push(entry());
  const result = checkCeiling(manifest, 1000);
  assert.equal(result.passed, true);
  assert.equal(result.reasons.length, 0);
});

test("fails when active count exceeds maxCount", () => {
  const manifest = emptyManifest({ maxCount: 1, maxPercent: 100 });
  manifest.entries.push(entry({ id: "a" }), entry({ id: "b" }));
  const result = checkCeiling(manifest, 1000);
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes("maxCount")));
});

test("fails when active percent exceeds maxPercent", () => {
  const manifest = emptyManifest({ maxCount: 100, maxPercent: 1 });
  manifest.entries.push(entry());
  const result = checkCeiling(manifest, 10); // 1/10 = 10% > 1%
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes("maxPercent")));
});

test("an expired entry is a hard failure even under the ceiling", () => {
  const manifest = emptyManifest({ maxCount: 50, maxPercent: 5 });
  manifest.entries.push(entry({ expiresAt: "2020-01-01T00:00:00.000Z" }));
  const result = checkCeiling(manifest, 1000, new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes("expired")));
});

test("an entry over maxRenewals fails even if not expired", () => {
  const manifest = emptyManifest({ maxCount: 50, maxPercent: 5, maxRenewals: 3 });
  manifest.entries.push(entry({ renewalCount: 4 }));
  const result = checkCeiling(manifest, 1000);
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes("maxRenewals")));
});

test("resolved entries never count toward the ceiling", () => {
  const manifest = emptyManifest({ maxCount: 0, maxPercent: 0 });
  manifest.entries.push(entry({ status: "resolved" }));
  const result = checkCeiling(manifest, 1000);
  assert.equal(result.passed, true);
});

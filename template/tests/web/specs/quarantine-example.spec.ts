import { test, expect } from "@qaf/core";

/**
 * Reference example of the quarantine mechanism (docs/quarantine.md): the
 * `@quarantined` tag in the title routes this test to the `chromium-quarantine`
 * project (non-blocking, higher retries) instead of the blocking `chromium`
 * project — see playwright.config.ts's `grep`/`grepInvert` split. Its
 * `quarantine-manifest.json` entry has an id built from this exact file path,
 * project name, and title path; `qaf-check-quarantine`'s sync-check fails CI
 * if the tag and the manifest entry ever disagree. Safe to delete once you
 * have a real quarantined test to reference instead.
 */
test.describe("Quarantine example", () => {
  test("demonstrates the quarantine mechanism @quarantined", async () => {
    // Deliberately flaky-by-design: fails ~50% of the time so the ceiling/retry
    // mechanism has something real to demonstrate in CI, without ever blocking
    // a merge (this only runs under the non-blocking `chromium-quarantine` project).
    expect(Math.random()).toBeGreaterThan(0.1);
  });
});

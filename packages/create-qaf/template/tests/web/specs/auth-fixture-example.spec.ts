import { test, expect } from "@qaf/core";

/**
 * Reference example for the `dataFactory` + `authenticatedPage` fixtures against
 * the bundled demo server (tests/fixtures/server) — createUser hits the demo's
 * /api/test-users endpoint and its cleanup is tracked automatically; replace the
 * factory/session endpoints in packages/core (or override them in your own repo)
 * once you have a real backend. Every user created here is namespaced per test
 * (see docs/data-isolation.md) so thousands of these can run in parallel without
 * colliding.
 */
test.describe("Auth + data isolation example", () => {
  test("creates an isolated user via dataFactory", async ({ dataFactory, testNamespace }) => {
    const user = await dataFactory.createUser({ displayNamePrefix: "example" });

    expect(user.email).toContain(testNamespace);
    expect(user.id).toBeTruthy();
    // No manual cleanup call needed — the dataFactory fixture's teardown runs
    // automatically after this test, regardless of pass/fail.
  });

  test("authenticatedPage starts already signed in", async ({ authenticatedPage }) => {
    const { user, page } = authenticatedPage;
    await page.goto("/");
    const storedEmail = await page.evaluate(() => window.localStorage.getItem("qaf_user_email"));
    expect(storedEmail).toBe(user.email);
  });
});

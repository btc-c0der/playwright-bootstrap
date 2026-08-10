# Anti-Patterns

Concrete things not to do, and why, so `pr-review` and human reviewers have a shared
checklist.

## Hard sleeps

```ts
// Wrong
await page.waitForTimeout(3000);

// Right — auto-retrying assertion, waits exactly as long as needed
await expect(page.getByText("Order placed")).toBeVisible();
```

A fixed sleep is either too short (flaky) or too long (slow at thousands-of-tests scale).
Playwright's own auto-waiting assertions and the resolver's probe timeout cover this.

## Shared mutable state across tests

```ts
// Wrong — a module-level variable shared across parallel workers/tests
let sharedUser;
test.beforeAll(async () => { sharedUser = await createUser(); });

// Right — each test gets its own, namespaced, auto-torn-down
test("...", async ({ dataFactory }) => {
  const user = await dataFactory.createUser();
});
```

Shared state is exactly what breaks at scale: two tests racing on the same resource in
different workers, or a test that passes alone but fails in the full suite. See
[data-isolation.md](data-isolation.md).

## Testing through the UI what an API call could set up

Don't drive a full UI signup/login flow just to get a signed-in session for a test that's
actually about something else entirely — use `authenticatedPage` (API-based) and reserve
UI-driven login for the login flow's own tests. Order-of-magnitude slower and flakier for
no benefit.

## CSS/XPath locators tied to styling or DOM structure

```ts
// Wrong — breaks the moment a class name or nesting level changes
await page.locator("div > div:nth-child(3) .btn-primary").click();
```

Use `data-testid` (or role/text via the resolver) instead — see [conventions.md](conventions.md).
If the element genuinely has none, that's a signal to add one to the app, not to reach for
a brittle selector.

## Silently widening the quarantine ceiling

```json
// Wrong — "fixing" a ceiling breach by just raising the cap
{ "ceiling": { "maxCount": 200 } }
```

If quarantine is hitting its ceiling, that's a signal to triage (see the
`triage-quarantine` skill / [quarantine.md](quarantine.md)), not to move the goalposts.
`pr-review` should flag any diff that only changes `ceiling.*` without also reducing
`entries`.

## Catching and swallowing errors to "make the test pass"

```ts
// Wrong
try {
  await expect(page.getByText("Success")).toBeVisible();
} catch {
  // ignore
}
```

If a test is unreliable, quarantine it explicitly (with a linked issue) — don't hide the
failure inside a try/catch. The whole point of the quarantine mechanism is that flakiness
stays visible and tracked, never silently absorbed.

## Asserting on implementation details instead of user-visible behavior

Prefer asserting what a user would see/experience (`expect(page.getByText(...))`) over
internal state (a specific class name, an internal store shape) unless the test is
specifically about that internal contract (e.g. an API contract test).

## Skipping `dataFactory` teardown by throwing inside a `finally`-less cleanup

Cleanup failures are logged (never thrown) by `TeardownStack` on purpose — don't add your
own cleanup code outside `dataFactory` that *does* throw on failure, or one flaky delete
call will mask the real test result.

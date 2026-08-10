# Conventions

These are enforced by `@qaf/eslint-plugin-qaf` and/or `pr-review` where practical; the rest
are conventions a reviewer should push back on even though nothing stops you from breaking
them.

## Locators — always through the resolver

Every element lookup goes through `this.find(descriptor)` (inside a `BasePage`/`BaseComponent`)
or the `resolve()` fixture directly. Never `page.locator()`, `page.$()`, `page.$$()`, or
`page.waitForSelector()` with a raw CSS/XPath string — **enforced** by
`qaf/require-data-testid`.

```ts
// Wrong — bypasses the fallback chain and drift logging entirely.
await page.locator(".btn-primary").click();

// Right
const button = await this.find({ testId: "submit-button", fallbackLabel: "submit button" });
await button.click();
```

`getByRole`/`getByText`/`getByLabel`/etc. called directly in a *spec* (for a one-off
assertion, not a reusable page-object lookup) are fine — they're exactly what the resolver
uses internally, and the rule allows them.

## Logging — always through the `logger` fixture

Never `console.log/warn/error` — **enforced** by `qaf/no-console`. Use the `logger` fixture
(`logger.info(...)`, `logger.debug(...)`, etc.) so output is structured, correlated to the
test/worker/shard, and consumable by the flaky/health reporters.

## Data — always through `dataFactory`, always cleaned up automatically

Create test data via `dataFactory.createX(...)` inside the test that needs it. Never share
mutable fixture data across tests via module-level `let`/`const`. See
[data-isolation.md](data-isolation.md).

## One test-case : one `test()` block

Don't merge multiple acceptance criteria into a single `test()` — when it fails, you want
the title to tell you exactly which behavior broke.

## Page objects contain no assertions

`expect(...)` calls belong in specs (or journeys don't have them either — see below), not
inside page-object methods. A page object's job is "do this action" / "give me this
locator", not "verify this state."

## Journeys contain no assertions either

A journey composes steps (`journey.ts` calling POM methods) — the spec that *uses* the
journey adds its own assertions afterward. This keeps one journey reusable across many
specs with different expectations.

## Adding a fixture

New cross-cutting fixtures belong in `@qaf/core` (open a PR against the framework), not
duplicated ad hoc in this repo's `playwright.config.ts` — that keeps every team on the same
underlying mechanism as it gets improved. Repo-specific one-off fixtures (specific to your
app, not reusable across teams) can extend `test` locally; see `@qaf/core`'s
`fixtures/index.ts` for the composition pattern to follow.

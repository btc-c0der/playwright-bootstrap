# Test Data Isolation

Goal: thousands of tests running in parallel across many workers and CI shards, with zero
chance two tests collide over the same data, and zero leftover data when a test ends
(pass, fail, or crash).

## Namespacing

Every worker gets a `workerNamespace`: `${shard}-w${workerIndex}-${8-char-random}`.
Playwright resets `workerIndex` at `0` independently *per shard*, so folding in the shard
id plus a random suffix is what actually guarantees uniqueness — `workerIndex` alone would
collide the moment two shards run concurrently (which they always do in CI).

Every test additionally gets a `testNamespace`: `${workerNamespace}-t${8-char-hash-of-titlePath}`.
Use this (via the `testNamespace` fixture, or implicitly through `dataFactory`) to namespace
anything you create directly without going through a factory (e.g. a unique email/slug).

## `dataFactory` and automatic teardown

```ts
test("...", async ({ dataFactory }) => {
  const user = await dataFactory.createUser({ displayNamePrefix: "checkout-test" });
  // ... test logic ...
  // No cleanup call needed: dataFactory's fixture teardown runs a LIFO stack of every
  // resource it created, after the test body finishes, regardless of pass/fail.
});
```

Every factory (see `packages/core/src/data/factories/user.factory.ts` in the framework
source for the reference implementation) pushes `{ type, id, deleteFn }` onto a
`TeardownStack` immediately after creating the resource. Teardown:

- Runs LIFO (last created, first deleted — respects dependency order for resources that
  reference each other).
- Never throws — a delete failure is logged (`logger.warn`) and recorded to
  `teardown-failures.json`, but doesn't fail the test or mask its real result. The `audit`
  skill surfaces accumulated teardown failures so orphaned data doesn't go unnoticed even
  though it's non-blocking.

## Adding a new factory

Follow `user.factory.ts`'s shape: accept `{ apiClient, teardown, testNamespace }`, namespace
whatever you create using `testNamespace`, register a `deleteFn` with the teardown stack
before returning. Add it to `dataFactory`'s composition in `@qaf/core`'s
`fixtures/data-factory.fixture.ts` (a framework-level change) or compose it locally in this
repo if it's specific to your app.

## What NOT to do

See [anti-patterns.md](anti-patterns.md) — no module-level shared fixtures, no
skipping `dataFactory` for "just this once."

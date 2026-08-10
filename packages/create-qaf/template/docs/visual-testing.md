# Visual Testing

## Why one canonical project

Baselines are pinned to a single dedicated Playwright project (named `visual`, running
Desktop Chrome) instead of every browser x OS x device combination — that combinatorial
explosion turns into hundreds of PNGs to review per UI change with no real added
confidence. `expectMatchesBaseline` (from `@qaf/core`) enforces this: it calls
`testInfo.skip()` on any project not in `DEFAULT_VISUAL_POLICY.canonicalProjects`
(`["visual"]` by default), so accidentally running a visual assertion under `chromium` or
`firefox` skips cleanly instead of failing on a baseline that was never meant to exist there.

```ts
test("matches baseline", async ({ page }, testInfo) => {
  await expectMatchesBaseline(page, "my-page.png", testInfo);
});
```

## First run / generating baselines

A brand-new visual spec has no baseline yet — `pnpm test:visual` will fail until one
exists. Generate it explicitly:

```bash
pnpm test:visual:update
```

This is why `visual` is its own project excluded from the default `pnpm test` /
`ci.yml` matrix (see [ci-sharding.md](ci-sharding.md)) — a missing baseline should never
block the main blocking suite.

## Updating baselines in CI

`visual.yml`'s `workflow_dispatch` input (`updateBaselines`) runs
`pnpm test:visual:update` and opens a PR with the regenerated PNGs — **it never commits
directly**. A human reviews every changed image before merging; nothing about an "expected"
diff is assumed automatically.

## Tuning sensitivity

`DEFAULT_VISUAL_POLICY` (`@qaf/core`) sets `maxDiffPixelRatio: 0.01` and
`animations: "disabled"` (Playwright freezes CSS animations/transitions before capturing).
Override per-call by passing a custom policy to `expectMatchesBaseline`, or change the
default in your fixtures if your whole suite needs a different tolerance.

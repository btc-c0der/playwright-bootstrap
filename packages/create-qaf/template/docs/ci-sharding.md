# CI Sharding

## How shard count is chosen

`determine-shards` (a job in `ci.yml`) reads `test-duration-history.json`'s rolling average
run time and targets ~5 minutes of tests per shard:

```
shardCount = clamp(ceil(estimatedTotalMinutes / 5), 4, 32)
```

A fresh repo with no history yet defaults to a 20-minute estimate (4 shards). As your suite
grows into the thousands of tests, this scales the shard count up automatically instead of
a hardcoded number quietly becoming a bottleneck (or, on the other end, wasting CI minutes
on more shards than a small suite needs).

## How tests are assigned to shards

Deliberately **not** reinvented — Playwright's native `--shard=x/N` already balances
individual tests (not just files) across shards using its own timing data. `ci.yml`'s `test`
job matrix crosses this shard count with the project list
(`chromium`/`firefox`/`webkit`/`mobile-chrome`/`mobile-safari`/`api`), so each project gets
its own independent shard split.

## Why visual and a11y aren't in this matrix

They're separate jobs/workflows (`visual.yml`, `a11y.yml`) on purpose — a visual regression
run needs a specific baseline-management flow (see [visual-testing.md](visual-testing.md))
and shouldn't slow down or block the main functional matrix; same for accessibility audits.
Run them via `pnpm test:visual` / `pnpm test:a11y` locally, or their dedicated CI workflows.

## Tuning for your suite size

- Adjust `targetPerShardMinutes` in `ci.yml`'s `determine-shards` step if 5 minutes isn't
  the right target for your team's CI cost/feedback-latency tradeoff.
- Raise the `32` shard ceiling if you're running tens of thousands of tests and CI runner
  concurrency allows it.
- The example config crosses every project (`chromium`/`firefox`/`webkit`/`mobile-chrome`/
  `mobile-safari`/`api`) with the *same* shard count from one `determine-shards` job. If one
  project's suite grows much larger than the others (e.g. thousands of web specs but a
  handful of API contract tests), split `determine-shards` per project so each gets a shard
  count sized to its own suite instead of sharing one number.

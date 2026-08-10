---
name: audit
description: Produce a periodic framework health report covering quarantine ceiling status, new flake candidates, pending AI-repair locator suggestions, teardown/orphaned-data failures, a11y trend, dependency audit, and pending changesets. Use when asked for a health check, a status report on the test suite, or run this periodically (e.g. weekly).
---

# Audit

A single point-in-time health report — read-only except for filing one tracking issue.
Never modifies the manifest, source, or dependencies itself (that's `triage-quarantine`,
`generate-tests`, and normal dependency-bump PRs, respectively).

## Inputs

- `pnpm audit --json` (dependency vulnerabilities)
- `quarantine-manifest.json` + `.qaf/test-run-history.jsonl` (for `analyzeFlakiness`)
- `locator-repair-suggestions.jsonl` (pending AI-repair suggestions, if the hook is enabled)
- Recent `a11y.yml` run results/trend (`gh run list --workflow=a11y.yml`)
- Pending `.changeset/*.md` files (unreleased framework changes)
- If `@qaf/rag-core` is installed and `QAF_RAG_ENABLED=true`: the `ci-failure` namespace of the
  RAG vector index (`.qaf/vector-index/ci-failure.jsonl`), via `summarizeClusters` — pending
  root-cause clusters, if the `/rag-coverage` skill's CI clustering step is set up. Skip this
  input entirely (don't attempt setup) if the package isn't installed.

## Steps

1. **Quarantine ceiling.** Run `pnpm check-quarantine`; capture active count/percent vs.
   ceiling, and list any entries expiring in the next 7 days (upcoming triage work).
2. **New flake candidates.** Anything `analyzeFlakiness` would surface that isn't yet in
   the manifest (i.e., what the next nightly `quarantine-audit.yml` run would propose).
3. **AI-repair suggestions.** Summarize any pending entries in
   `locator-repair-suggestions.jsonl` — these indicate locator drift that hasn't been
   fixed in the page object yet.
4. **Teardown failures.** Any `teardown-failures.json` entries — possible orphaned test
   data in whatever backend the suite targets.
5. **Dependency audit.** Summarize `pnpm audit` findings at `high`/`critical` severity.
6. **a11y trend.** Rising violation count over the last N runs, if visible from workflow
   history.
7. **Pending changesets.** List unreleased `.changeset/*.md` entries — signals framework
   updates the team hasn't shipped/adopted yet.
8. **Recurring root-cause clusters** (only if `@qaf/rag-core` is installed and enabled).
   Clusters with >= 2 occurrences spanning multiple _distinct_ tests point at an infra-level
   cause rather than one test's own flakiness — complementary to step 2's per-test
   `analyzeFlakiness`. Skip this step entirely, without comment, if the package isn't set up.

## Output

- Write `docs/health-reports/<YYYY-MM-DD>.md` using the structure from
  `buildHealthReportMarkdown` (`@qaf/core`) as a baseline, extended with the dependency/a11y/
  changeset sections above.
- File one GitHub issue (`gh issue create`) titled `QAF health report — <date>` with an
  actionable checklist (one line per finding that needs a human decision), linking the
  full report. Do not file an issue if there is nothing actionable — say so in your
  response instead.

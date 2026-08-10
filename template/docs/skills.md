# The Claude Skills Pipeline

Six `.claude/skills/*` skills cover requirements analysis through test execution and
ongoing maintenance. Each has a narrow, single-purpose job — chain them rather than asking
one skill to do another's work.

```
issue / bug report / spec
  -> analyze-requirements  -> test-cases.json + markdown summary (human reviews/approves)
       -> generate-tests   -> new .spec.ts / .page.ts files (self-checked: eslint + tsc)
            -> (tests run in CI: ci.yml's sharded matrix)
                 -> pr-review   -> one consolidated advisory review comment on the PR

ongoing maintenance (not part of the per-feature flow above):
  quarantine-audit.yml (nightly bot)  -> proposes new quarantine entries via PR
       -> triage-quarantine  -> resolves/fixes/renews existing entries, opens PR(s)
  audit  -> periodic health report (docs/health-reports/<date>.md) + tracking issue
  rag-coverage (opt-in, needs @qaf/rag-core)
       -> spec-to-test coverage report (docs/coverage-reports/<date>.md) + tracking issue
       -> feeds audit's "recurring root-cause clusters" section once CI clustering is set up
```

## Why separate skills instead of one "do everything" skill

Each stage has a different input shape, a different output shape, and a different blast
radius if it goes wrong — analyzing requirements is read-only and low-risk; generating
tests writes new files; PR review only ever posts a comment; quarantine triage and audits
can open PRs. Keeping them separate means you can invoke exactly the stage you need (e.g.
just `pr-review` on an already-written PR) without re-running everything upstream, and a
mistake in one stage's output doesn't silently corrupt the next stage's assumptions since
each output is human-reviewed before the next skill consumes it.

## Running them

Invoke by name (`/analyze-requirements`, `/generate-tests`, `/pr-review`,
`/triage-quarantine`, `/audit`, `/rag-coverage`) or describe the task naturally — see each
skill's `SKILL.md` for its exact inputs/outputs. `rag-coverage` additionally requires
`@qaf/rag-core` to be installed and configured — see
[rag-coverage.md](rag-coverage.md).

## Adapting to your team

These are a starting point, not a fixed contract — edit the `SKILL.md` files directly for
things specific to your team (e.g. `pr-review` checking for an internal ticket-link
convention, `analyze-requirements` pulling from a tool other than GitHub Issues).

---
name: pr-review
description: Review an open pull request against this framework's conventions (data-testid usage, no console.*, quarantine ceiling/sync, visual baseline changes, fixture usage) and post one consolidated advisory review comment. Use when asked to review a PR, or before merging test-suite changes.
---

# PR Review

An advisory review focused specifically on QA-framework conventions — not a general code
reviewer. It never edits or merges anything; it posts one review comment and lets a human
decide.

## Inputs

- `gh pr diff <n>` — the changed files
- `quarantine-manifest.json` diff (`git diff origin/main -- quarantine-manifest.json`)
- Latest CI run results for the PR (`gh pr checks <n>`)

## Checklist

1. **Locator discipline.** Any changed `.ts` file under `tests/` using raw
   `page.locator()/$()/$$()/waitForSelector()` instead of `this.find()`/`resolve()`? This
   should already be caught by `@qaf/eslint-plugin-qaf`, but re-check — and flag any
   `eslint-disable` comment added around it without a one-line justification.
2. **No console.*.** Same as above for `console.log/warn/error` — must go through the
   `logger` fixture instead.
3. **Data isolation.** New tests should create their own data via `dataFactory`, not depend
   on a shared/module-level fixture or another test's leftover state. Flag any new
   module-level `let`/`const` holding mutable test data.
4. **Quarantine discipline.** If the manifest diff adds an entry: is there a `linkedIssue`?
   Does the corresponding test actually carry the `@quarantined` tag (run
   `pnpm check-quarantine` if unsure — it's the authoritative sync check)? If the diff
   *removes* an entry, was the test actually re-verified (check for a comment/PR reference),
   not just deleted from the manifest to dodge the ceiling?
5. **Visual changes.** Any changed `*-snapshots/**` PNGs? These must come with an explicit
   note in the PR description about what UI change they capture — flag if silent.
6. **CI status.** Note any failing/skipped checks from `gh pr checks` relevant to this diff.

## Output

Post **one** consolidated comment via `gh pr comment <n> --body-file -` (don't post one
comment per finding). Structure it as: a one-line verdict (approve / needs changes),
then each checklist item that found something, with a file:line reference and a concrete
suggested fix. Say nothing about items that are clean — don't pad the review.

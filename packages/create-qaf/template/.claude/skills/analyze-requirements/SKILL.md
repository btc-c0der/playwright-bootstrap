---
name: analyze-requirements
description: Turn a GitHub issue, bug report, or spec into structured, reviewable test cases before any test code is written. Use when a user gives you an issue number, issue URL, or pasted requirements/bug description and wants QA coverage planned out.
---

# Analyze Requirements

The first stage of the requirements -> test case -> test execution pipeline. Produces a
structured, human-reviewable test plan — no test code yet. That's `generate-tests`'
job, once this output is approved.

## Inputs

One of:
- A GitHub issue number or URL (`gh issue view <n> --json title,body,labels,comments`)
- Pasted requirements / a bug report / an acceptance-criteria list

## Steps

1. **Gather context.** If given an issue, fetch it with `gh issue view` (include comments —
   clarifications often live there, not in the original body). Read `docs/architecture.md`
   and `docs/folder-structure.md` to understand which test project(s) (web/api/mobile) and
   which existing page objects/journeys are relevant.
2. **Check for existing coverage.** Grep `tests/**/*.spec.ts` for related titles/POM usage
   so you don't propose duplicate cases. Note what already exists vs. what's net-new.
3. **Draft structured test cases.** For each distinct behavior/acceptance criterion, produce:
   - `id` — short stable slug (e.g. `login-invalid-password`)
   - `title` — human-readable test title
   - `project` — `web` | `api` | `mobile`
   - `steps` — ordered user/API actions
   - `expected` — the assertion(s) that define pass/fail
   - `priority` — `p0` (blocking release) | `p1` | `p2`
   - `dataNeeds` — what `dataFactory` calls/fixtures this will need (e.g. "one user with role=admin")
4. **Flag ambiguity instead of guessing.** If acceptance criteria are unclear or contradictory,
   list it under "Open questions" rather than inventing behavior.
5. **Write the output.**

## Output

- `test-cases.json` — an array of the structured test cases above, at the repo root
  (or a path the user specifies) — this is `generate-tests`' input.
- A markdown table in your response summarizing the same cases for quick human review,
  plus an "Open questions" section if anything needs clarification before generating tests.

Do not write any `.spec.ts` files in this skill — that's `generate-tests`, and it should
only run against an *approved* `test-cases.json`.

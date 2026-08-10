---
name: rag-coverage
description: Embed specs (internal docs, Jira, Confluence, Zephyr) and the test suite into a shared vector space, then report which specs have no matching test (gaps) and which tests trace to no spec (orphans). Use when asked for a coverage/traceability report, or to check which requirements lack test coverage. Requires @qaf/rag-core and QAF_RAG_ENABLED=true — see docs/rag-coverage.md.
---

# RAG Coverage

A single point-in-time coverage report — read-only except for filing one tracking issue, same
posture as `audit`. Output is advisory: semantic similarity is a hint, not proof of coverage.
Never treat a "gap" as license to auto-generate a test, or an "orphan" as license to delete one
— both are for a human to review.

## Prerequisites

`@qaf/rag-core` installed (`pnpm add -D @qaf/rag-core`) and a real `EmbeddingProvider` wired via
`QAF_RAG_PROVIDER_MODULE` (see [rag-coverage.md](../../docs/rag-coverage.md)). If either is
missing, say so and stop rather than attempting a partial run.

## Inputs

- Internal specs: this repo's own `docs/**` markdown.
- The test catalog: `playwright test --list --reporter=json`.
- Jira issues (optional): fetched via the Atlassian MCP tools if connected
  (`searchJiraIssuesUsingJql`, `getJiraIssue`) — normalize to the `JiraIssueInput[]` shape
  `@qaf/rag-core`'s `sources/jira.ts` documents and write to a JSON file.
- Confluence pages (optional): same pattern via `getConfluencePage`/`searchConfluenceUsingCql`,
  normalized to `ConfluencePageInput[]`.
- Zephyr test cases (optional): only if the team has already supplied an export/API script —
  do not attempt to build one ad hoc inside this skill.

## Steps

1. **Check prerequisites.** Confirm `@qaf/rag-core` is a dependency and `QAF_RAG_ENABLED=true`
   is set for this run (export it inline rather than assuming it's already set).
2. **Gather Jira/Confluence, if in scope.** If the user wants those included and the Atlassian
   MCP tools are available, fetch and normalize them to the JSON shapes above, write to
   `.qaf/jira-issues.json` / `.qaf/confluence-pages.json`, and set
   `QAF_RAG_JIRA_ISSUES_PATH`/`QAF_RAG_CONFLUENCE_PAGES_PATH` accordingly. If the tools aren't
   connected, say so and proceed with internal specs + tests only rather than failing outright.
3. **Index.** Run `qaf-rag-index`. Report the per-namespace fetched/embedded/skipped/deleted
   counts it prints — a surprisingly large "embedded" count on a repeat run usually means a
   chunking or provider-id change, worth flagging.
4. **Map.** Run `qaf-rag-map`, which writes `docs/coverage-reports/<date>.md`.
5. **Summarize for the human.** Don't just point at the file — pull out the gap and orphan
   counts and the highest-priority-looking gaps (specs whose title suggests P0/critical
   behavior) into your response.
6. **File one tracking issue** (`gh issue create`) titled `RAG coverage report — <date>` with an
   actionable checklist, one line per gap that looks worth a human decision, linking the full
   report — same "skip if nothing actionable" rule `audit` follows. Do not create test code,
   close any ticket, or delete any test as part of this skill.

## Output

- `docs/coverage-reports/<date>.md`.
- A markdown summary in your response: gap/partial/covered/orphan counts, the gaps worth
  attention, and any prerequisite that blocked part of the run (e.g. "Jira wasn't included —
  Atlassian MCP tools weren't connected").
- One tracking issue, only if there's something actionable.

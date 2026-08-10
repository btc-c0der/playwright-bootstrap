# RAG semantic coverage — implementation plan (proposal)

Status: **planning, not yet built.** This document is the output of a planning pass, scoped
against three decisions already made (see "Decisions" below). Nothing under `packages/rag-core`
exists yet — this is the blueprint before the first PR.

## Goal

Turn docs (Jira, Confluence, Zephyr, internal specs) and tests into a shared embedding space so
we can answer, continuously and semi-automatically:

1. **Spec-to-test mapping** — which requirements/tickets have test coverage, which don't, and
   which tests no longer trace to any live requirement (orphans).
2. **CI root-cause similarity** — when a test fails in CI, has this exact failure signature
   (not just this test) been seen before, and what was the root cause / resolution last time?

## Decisions made before this plan

| Question                  | Decision                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where does this live?     | New published package, `packages/rag-core` (`@qaf/rag-core`) — not folded into `@qaf/core`, not template-only. Follows the monorepo's existing pattern (`docs/architecture.md`) of framework capability = published, versioned package.     |
| Vector store / embeddings | Pluggable provider interfaces (`EmbeddingProvider`, `VectorStore`), same shape as the existing `AiRepairProvider` opt-in hook. Ships a dependency-free local default; real backends are a consuming-repo choice.                            |
| Phase 1 scope             | Spec-to-test mapping, starting with internal specs + the test suite itself (zero external dependencies), then layering in Jira/Confluence via the already-connected Atlassian MCP tools. CI root-cause clustering and Zephyr are phase 2/3. |

## Why this shape (precedent in this repo)

This isn't a new pattern for the framework — it's the same one already used for AI-repair
locators, just applied to a different problem:

- **Opt-in provider interface + Noop default** (`AiRepairProvider` / `NoopAiRepairProvider`,
  [ai-repair.ts](../packages/core/src/locator-resolver/ai-repair.ts)) — no test run is ever
  forced to hold an API key or call an external model it didn't ask for. `EmbeddingProvider`
  follows the identical shape.
- **JSONL, append-only, file-based state** (`test-run-history.jsonl`,
  `locator-repair-suggestions.jsonl`) instead of a database — matches how this framework already
  persists cross-run state without introducing infra. The local vector store follows this.
- **Pure-function reporters over already-computed inputs**
  ([health-report.ts](../packages/core/src/reporters/health-report.ts)) — coverage/root-cause
  reports are rendered the same way, trivially testable, reusable outside any one skill.
- **Advisory only, human-reviewed** — exactly like AI-repair suggestions
  (`locator-repair-suggestions.jsonl` is "advisory only and never applied back to test source")
  and like `pr-review`'s comment-only blast radius. Nothing here gates CI or auto-edits test
  source; see Risks.

## Package layout

```
packages/rag-core/                      @qaf/rag-core — new published package
  src/
    embedding/
      types.ts              EmbeddingProvider interface
      noop.ts                NoopEmbeddingProvider — throws with a doc pointer, mirrors
                             NoopAiRepairProvider but embedding genuinely can't no-op silently
    vector-store/
      types.ts               VectorRecord, ScoredRecord, VectorStore interface
      local-jsonl-store.ts    default backend: one JSONL file per namespace under
                              .qaf/vector-index/, loaded into memory, brute-force cosine
                              similarity at query time — fine at single-team scale
                              (thousands of docs/tests/failures); swappable for
                              pgvector/Qdrant/Pinecone by implementing VectorStore
    sources/
      types.ts               SourceDocument, DocumentSource interface
      internal-specs.ts      repo markdown (docs/**, template/docs/**) chunked by heading
      test-catalog.ts        one SourceDocument per test, derived from
                              `playwright --list --reporter=json` (title + describe path +
                              tags) — reuses the discovery logic qaf-check-quarantine already
                              has for id-stability
      jira.ts                shape only — the actual Jira fetch happens in the /rag-coverage
                              skill via Atlassian MCP tools, not an HTTP client in this package
      confluence.ts           same pattern as jira.ts
      zephyr.ts               phase 3 — shape only for now, no concrete fetch
    indexing/
      chunk.ts                per-source-type chunking strategies
      index.ts                indexDocuments(): content-hash-based incremental reindex,
                              batched embed calls, upsert, and deletion reconciliation for
                              docs removed at the source
    mapping/
      types.ts                CoverageMapping, CoverageGap, OrphanTest
      spec-to-test.ts          nearest-neighbor mapping + threshold-based gap/orphan detection
    failure-clustering/        (phase 2)
      types.ts                FailureRecord, FailureCluster
      symbolize.ts             canonicalizes a raw stack trace/log into a stable signature
                              (strips line:col, timestamps, UUIDs, absolute paths, ports,
                              memory addresses) before embedding — see "Why symbolize" below
      cluster.ts               embeds a new failure signature, nearest-neighbor matches it
                              against the historical failure index, assigns/creates a cluster
    reporters/
      coverage-report.ts       markdown renderer, same shape as buildHealthReportMarkdown
      root-cause-report.ts     (phase 2) markdown renderer for clustered CI failures
    bin/
      qaf-rag-index.ts         CLI: incremental embed+index of all configured sources
      qaf-rag-map.ts           CLI: run spec-to-test mapping, print/report gaps+orphans
      qaf-rag-cluster.ts       (phase 2) CLI: cluster this CI run's failures against history
```

## Core interfaces

```ts
// embedding/types.ts
export interface EmbeddingProvider {
  readonly id: string; // e.g. "openai:text-embedding-3-small" — stored per-vector so a
  // model change invalidates old vectors instead of silently mixing spaces
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

// vector-store/types.ts
export interface VectorRecord {
  id: string; // stable per source item, e.g. "jira:PROJ-123" or test's buildEntryId()
  namespace: "spec" | "test" | "jira" | "confluence" | "zephyr" | "ci-failure";
  vector: number[];
  metadata: Record<string, unknown>;
  contentHash: string; // sha256 of normalized source text — drives incremental reindex
  indexedAt: string;
}
export interface ScoredRecord extends VectorRecord {
  score: number;
}

export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>;
  query(
    vector: number[],
    opts: { namespace?: string; topK: number; minScore?: number },
  ): Promise<ScoredRecord[]>;
  delete(ids: string[]): Promise<void>;
  all(namespace?: string): Promise<VectorRecord[]>;
}
```

`QAF_RAG_ENABLED=true` gates real indexing the same way `QAF_AI_REPAIR_ENABLED=true` gates
AI-repair — unset, `qaf-rag-index` is a no-op and `NoopEmbeddingProvider` throws a clear
"this is opt-in, see docs/rag-coverage.md" error if something tries to embed anyway.

## Spec-to-test mapping algorithm (phase 1)

1. Every source item becomes a `SourceDocument { id, namespace, text, metadata, contentHash }`.
   Tests are chunked as **intent**, not implementation — title + describe path + tags + the
   first assertion-bearing lines — not the full `.spec.ts` body, since implementation detail is
   noise relative to what a spec/ticket is describing.
2. `indexDocuments()` skips re-embedding anything whose `contentHash` hasn't changed since the
   last run (a per-namespace id→hash manifest, same idea as `quarantine-manifest.json` tracking
   known entries) — this keeps embedding-API cost proportional to _changed_ docs, not total corpus.
3. `spec-to-test.ts` queries each indexed spec doc against the `test` namespace, keeps matches
   above a similarity threshold τ (configurable — Jira AC phrasing vs. Playwright titles diverge
   more than test-to-test phrasing, so τ likely needs to be lower here than for dedup-style
   queries), and classifies each spec as `covered` / `partial` / `gap`. Tests with no spec above
   τ anywhere are flagged as `orphan` — a governance signal, not an automatic deletion trigger.
4. `coverage-report.ts` renders `docs/coverage-reports/<date>.md` from the same
   `CoverageMapping[]`/`CoverageGap[]`/`OrphanTest[]` shapes — reusable outside the skill, like
   `buildHealthReportMarkdown`.

## CI root-cause clustering (phase 2)

**Why symbolize before embedding:** a raw stack trace embeds poorly on its own — line numbers,
timestamps, temp file paths, and object addresses dominate lexical/semantic distance, so two
occurrences of the _same_ root cause in two different CI runs look "unique" to a naive embedding.
`symbolize.ts` strips those volatile tokens first (line:col, timestamps, UUIDs, absolute paths →
relative, ports, memory addresses), leaving a canonical signature — call order + symbol names +
error message shape — that's what actually gets embedded.

1. A new Playwright reporter (same shape as `HistoryReporter`) captures, per failure: error
   message, stack trace, trailing log lines, test id, file, project, commit SHA.
2. `symbolize.ts` → canonical signature → embed → query `ci-failure` namespace for nearest
   historical signature.
3. Above threshold: attach the _existing_ cluster id (+ whatever `linkedIssue`/resolution a human
   previously attached to that cluster — same idea as quarantine's `linkedIssue` field). Below
   threshold: this failure becomes a new cluster's reference signature.
4. `qaf-rag-cluster` runs post-test in CI and posts a PR annotation extending the existing
   `quarantine/annotate.ts` helper — "this failure matches cluster #N, seen 6 times, last root
   cause: <label>" — so triage starts from prior art instead of from zero.
5. Retention: unbounded failure history needs a pruning policy (keep every _labeled_ reference
   signature + last N raw occurrences per cluster) — a real risk to flag now, not backfill later.
6. `audit` gains a "recurring root-cause clusters" section: clusters recurring across _different_
   tests in the trailing window point at infra-level causes, not per-test flakiness —
   complementary to, not a replacement for, `analyzeFlakiness`.

## Jira / Confluence / Zephyr integration

`@qaf/rag-core` intentionally does **not** ship an Atlassian HTTP client. `sources/jira.ts` and
`sources/confluence.ts` define only the `SourceDocument` shape. The actual fetch happens in a new
`/rag-coverage` skill, using the Atlassian MCP tools already connected in this environment
(`searchJiraIssuesUsingJql`, `getConfluencePage`, `searchConfluenceUsingCql`) — normalized output
gets written to a JSON file that `qaf-rag-index` then embeds. This means:

- No stored Atlassian credentials/base-URL config inside the package.
- Teams without Claude Code's MCP connector can still populate the same normalized JSON via their
  own Jira REST script and get identical downstream behavior.

**Zephyr has no MCP connector today.** `sources/zephyr.ts` ships as an interface only in phase 1;
phase 3 implements a concrete fetch once the team decides between Zephyr Scale's REST API
(needs an API token) or a CSV/export ingestion stopgap.

## Skills-pipeline integration

New skill, parallel to `audit` (`.claude/skills/rag-coverage/SKILL.md`):

```
Inputs: docs/**, template/docs/** (internal specs) · playwright --list --reporter=json (tests)
        · Jira/Confluence via Atlassian MCP tools · (phase 3) Zephyr export
Steps: fetch+normalize each source -> qaf-rag-index (incremental embed+upsert)
       -> qaf-rag-map (compute mapping/gaps/orphans) -> render docs/coverage-reports/<date>.md
       -> file one tracking issue for gaps above severity threshold, same "skip if nothing
          actionable" rule audit already follows
Output: docs/coverage-reports/<date>.md (+ optional tracking issue)
```

`audit`'s `SKILL.md` gets a line pointing at the coverage report once phase 1 ships, same as it
already aggregates quarantine/flake/AI-repair/teardown signals from other mechanisms.

## Phasing

**Phase 1 — spec-to-test mapping** (this plan's immediate build target)

1. `@qaf/rag-core` skeleton: `embedding/`, `vector-store/` (local JSONL default), `indexing/`.
2. `sources/internal-specs.ts` + `sources/test-catalog.ts` — zero external dependencies, ships
   end-to-end value against this repo's own docs/tests first (same instinct as the bundled demo
   todo app: prove the mechanism before wiring anything external).
3. `mapping/spec-to-test.ts` + `reporters/coverage-report.ts`.
4. `bin/qaf-rag-index.ts`, `bin/qaf-rag-map.ts`.
5. `/rag-coverage` skill, internal-specs + tests only.
6. `docs/rag-coverage.md` (+ template equivalent): architecture, how to plug a real
   `EmbeddingProvider`/`VectorStore`, cost expectations.
7. Extend the skill to pull Jira/Confluence via Atlassian MCP tools once the mapping engine is
   validated on internal specs — additive to `sources/`, no change to `mapping/`/`reporters/`.

**Phase 2 — CI root-cause clustering**

1. `failure-clustering/symbolize.ts` — tune against this repo's own real CI failure history first.
2. `failure-clustering/cluster.ts` + retention/pruning policy for `.qaf/vector-index/ci-failure.jsonl`.
3. `bin/qaf-rag-cluster.ts`, wired into `ci.yml` as a post-test step; extend `quarantine/annotate.ts`.
4. `audit` gains the "recurring root-cause clusters" section.

**Phase 3 — Zephyr + tightening**

1. Concrete `sources/zephyr.ts` (REST API vs. export ingestion, per team's Zephyr access).
2. Threshold/chunking tuning from phase 1/2 false-positive feedback (see Risks — this is the
   highest-leverage ongoing work, not a one-shot design).
3. Optional: swap `LocalJsonlVectorStore` for a hosted backend once/if corpus size warrants it.

## Risks / open questions (surface these, don't silently decide them)

- **Semantic similarity ≠ correctness.** A high score between a Jira AC and a test title is a
  _hint_, not proof of coverage. False negatives (real coverage phrased very differently) and
  false positives (similar wording, different behavior) are both expected. All output is
  advisory and human-reviewed — nothing here gates CI or auto-closes gaps, same posture as
  AI-repair suggestions and `pr-review` comments.
- **Chunking strategy dominates result quality** more than embedding model choice — budget
  iteration time here, not a one-shot design.
- **Threshold tuning** needs a small labeled validation set (known-covered / known-gap pairs from
  this repo) before the output is trustworthy enough to act on org-wide.
- **Stack-trace symbolization** (phase 2) is Playwright/Node-shape-specific and easy to get wrong
  in either direction — too aggressive collapses genuinely distinct errors together, too weak
  never clusters anything. Needs real failure samples to tune, not synthetic ones.
- **Embedding cost/latency + API-key handling** — same no-default-credentials, opt-in posture as
  AI-repair; document expected cost (tokens × corpus size) so teams aren't surprised.
- **PII/sensitive content in Jira/Confluence** entering a vector store is a data-handling/retention
  decision the team must make explicitly before indexing real tickets — this plan doesn't decide
  it for them.
- **Unbounded failure-history growth** (phase 2) needs a pruning policy from day one.

## Repo touch points once building starts

- New: `packages/rag-core/**`, `.claude/skills/rag-coverage/SKILL.md` (+ `template/` equivalents).
- Extend: `docs/architecture.md` (new package row), `.claude/skills/audit/SKILL.md` (new inputs),
  `packages/core/src/quarantine/annotate.ts` (reused for CI comment posting in phase 2),
  `.github/workflows/ci.yml` / `template/.github/workflows/*` (phase 2 post-test step).
- `.gitignore`: add `.qaf/vector-index/` and any new summary files by name, matching the existing
  convention of listing generated artifacts explicitly (`test-run-history.jsonl`,
  `locator-repair-suggestions.jsonl`, `flake-detection-summary.json`).

## See also

- [architecture.md](architecture.md) — monorepo package layout this plan extends
- [../packages/core/src/locator-resolver/ai-repair.ts](../packages/core/src/locator-resolver/ai-repair.ts) — the provider-interface pattern this plan mirrors
- [../.claude/skills/audit/SKILL.md](../.claude/skills/audit/SKILL.md) — the health-report pattern `/rag-coverage` follows

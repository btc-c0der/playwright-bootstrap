# RAG semantic coverage (`@qaf/rag-core`)

Implements the plan in [rag-coverage-plan.md](rag-coverage-plan.md). This doc covers how the
package actually works and how to wire it up — read the plan doc first for the "why".

## What it does

`@qaf/rag-core` embeds specs (internal docs, Jira issues, Confluence pages, Zephyr test cases)
and tests into a shared vector space, then answers two questions:

1. **Spec-to-test mapping** — `computeSpecToTestMapping()` + `buildCoverageReportMarkdown()`:
   which specs have test coverage, which don't (gaps), and which tests trace to no live spec
   (orphans).
2. **CI root-cause clustering** — `clusterFailure()` + `buildRootCauseReportMarkdown()`: does a
   new CI failure's symbolized stack trace match one seen before, and what was its root cause?

Both outputs are **advisory only** — nothing here gates CI, auto-closes gaps, or edits test
source. Semantic similarity is a hint, not proof; see the plan doc's Risks section.

## It's opt-in, and ships no real backend

Nothing runs unless `QAF_RAG_ENABLED=true` is set. Unset, `qaf-rag-index` and `qaf-rag-cluster`
no-op with a message explaining why. Two provider interfaces you must wire yourself:

- **`EmbeddingProvider`** — the package ships only `NoopEmbeddingProvider`, which throws if
  actually invoked. Wire a real one via `QAF_RAG_PROVIDER_MODULE=<path-to-module>`, where the
  module's default export is either an `EmbeddingProvider` or a zero-arg factory returning one:

  ```ts
  // rag-provider.ts — an example OpenAI-backed provider
  import OpenAI from "openai";
  import type { EmbeddingProvider } from "@qaf/rag-core";

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  export default {
    id: "openai:text-embedding-3-small",
    dimensions: 1536,
    async embed(texts) {
      const res = await client.embeddings.create({ model: "text-embedding-3-small", input: texts });
      return res.data.map((d) => d.embedding);
    },
  } satisfies EmbeddingProvider;
  ```

  Then: `QAF_RAG_ENABLED=true QAF_RAG_PROVIDER_MODULE=./rag-provider.ts qaf-rag-index`.

- **`VectorStore`** — the package ships `LocalJsonlVectorStore`: one JSONL file per namespace
  under `.qaf/vector-index/`, loaded into memory, brute-force cosine similarity at query time.
  Fine at single-team scale (thousands of docs/tests/failures — a linear scan over that many
  ~1500-dim vectors is sub-100ms). Swap in a `pgvector`/Qdrant/Pinecone-backed `VectorStore` by
  implementing the same four-method interface once corpus size actually warrants it — don't
  pre-optimize.

**Cost/latency expectations:** every `qaf-rag-index` run only re-embeds content whose hash
changed since the last run (see "Incremental indexing" below), so steady-state cost is
proportional to what changed, not total corpus size. The first run on a large existing corpus
(e.g. thousands of Jira issues) will make that many embedding calls — check your provider's
pricing before pointing this at a large backlog.

## Spec-to-test mapping walkthrough

```bash
export QAF_RAG_ENABLED=true
export QAF_RAG_PROVIDER_MODULE=./rag-provider.ts

# 1. Embed internal specs (docs/**) + the test catalog (playwright --list) into .qaf/vector-index/
qaf-rag-index

# 2. Query the index, write docs/coverage-reports/<date>.md
qaf-rag-map
```

To include Jira/Confluence/Zephyr, set the corresponding env var to a JSON file of
already-normalized documents before running `qaf-rag-index`:

| Env var                         | Shape                                                 | How the `/rag-coverage` skill produces it                            |
| ------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| `QAF_RAG_JIRA_ISSUES_PATH`      | `JiraIssueInput[]` (see `sources/jira.ts`)            | Atlassian MCP tools (`searchJiraIssuesUsingJql`)                     |
| `QAF_RAG_CONFLUENCE_PAGES_PATH` | `ConfluencePageInput[]` (see `sources/confluence.ts`) | Atlassian MCP tools (`getConfluencePage`/`searchConfluenceUsingCql`) |
| `QAF_RAG_ZEPHYR_CASES_PATH`     | `ZephyrTestCaseInput[]` (see `sources/zephyr.ts`)     | Zephyr Scale REST API or export, team-supplied                       |

No Atlassian/Zephyr HTTP client ships in this package on purpose — see the plan doc's
"Jira / Confluence / Zephyr integration" section for why. A team without the MCP connector can
populate the same JSON files with their own script and get identical downstream behavior. If you
do have direct Zephyr Scale Cloud API access, `createZephyrScaleApiSource()` is a ready-made
paginated adapter — see `sources/zephyr.ts`.

## Incremental indexing

`indexDocuments()` hashes each chunk's text and skips re-embedding anything whose hash (and
`EmbeddingProvider.id`) matches what's already stored — so a model change forces a full
re-embed (different vector space), but an unrelated doc edit only re-embeds itself. Docs removed
from a source since the last run are deleted from the store in the same pass.

## Chunking

`chunkDocument()` splits long prose documents (`spec`/`confluence` namespaces) by markdown
heading, merging adjacent short sections so frequent headings don't flood the index with
near-empty chunks. Tests, Jira issues, and Zephyr cases are already intent-sized units and are
never split. **Chunking strategy affects mapping quality more than embedding model choice** —
tune `maxChars` and the merge behavior against your own corpus before tuning anything else.

## CI root-cause clustering walkthrough

1. Register `FailureReporter` (`@qaf/rag-core/reporter`) alongside your other Playwright
   reporters in `playwright.config.ts` — it appends one JSONL record per _failed_ test to
   `ci-failures.jsonl`.
2. After the test run, in CI:
   ```bash
   QAF_RAG_ENABLED=true QAF_RAG_PROVIDER_MODULE=./rag-provider.ts qaf-rag-cluster
   ```
   This symbolizes each new failure's stack trace (`symbolizeFailure()` — strips line numbers,
   timestamps, UUIDs, memory addresses, absolute paths before embedding, so two occurrences of
   the same root cause actually cluster together), embeds it, and matches it against the
   `ci-failure` namespace's history. Matches print a `::warning` GitHub Actions annotation
   ("matches cluster X, N prior occurrences") the same way `@qaf/core`'s
   `quarantine/annotate.ts` does; a new signature prints a `::notice`.
3. Labeling a cluster's root cause: attach `rootCauseLabel`/`linkedIssue` to any occurrence's
   vector-store metadata for a `clusterId` (e.g. via a small one-off script, or directly editing
   the JSONL) once triaged — every subsequent match in that cluster carries it forward.
4. `summarizeClusters()` + `buildRootCauseReportMarkdown()` render the "recurring root-cause
   clusters" view — clusters spanning multiple _distinct_ tests point at an infra-level cause,
   complementary to `@qaf/core`'s per-test `analyzeFlakiness`.

Unbounded growth of `ci-failure.jsonl` is a known limitation — this package doesn't prune it for
you yet. If it grows large, keep every occurrence with a `rootCauseLabel` (reference signatures)
and truncate the rest to the last N per cluster.

## When to graduate off the local store

`LocalJsonlVectorStore` loads every namespace fully into memory and does a linear scan per
query. That's the right tradeoff at single-team scale, and the wrong one once a namespace grows
into the tens of thousands of records or query latency actually matters. When you hit that,
implement `VectorStore` against pgvector/Qdrant/Pinecone/etc. and swap the constructor call in
your `qaf-rag-*` invocations — nothing else in this package needs to change.

## See also

- [rag-coverage-plan.md](rag-coverage-plan.md) — the design rationale, phasing, and risks
- [architecture.md](architecture.md) — where this package sits in the monorepo
- [../packages/rag-core/src/index.ts](../packages/rag-core/src/index.ts) — full public API

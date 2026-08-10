# Architecture (playwright-bootstrap monorepo)

This is the framework's own source monorepo — not a generated test suite. If you're looking
for docs on writing tests with the framework, that's `template/docs/` (what QA teams
actually get via `create-qaf`); this file covers the framework's _own_ internals.

## Packages

```
packages/
  core/               @qaf/core — published to npm
    fixtures/          test.extend composition: logger, apiClient, dataFactory,
                       locatorResolver, auth — merged in fixtures/index.ts
    pom/               BasePage, BaseComponent
    logger/            Logger class wrapping pino
    locator-resolver/  resolve() fallback chain + the opt-in AI-repair hook
    data/              namespacing, TeardownStack, factories/
    quarantine/        manifest, ceiling check, sync check, the HistoryReporter,
                       CI annotation helpers
    visual/, a11y/     toHaveScreenshot / axe-core wrappers + policy
    reporters/         flake analysis + health-report markdown rendering
    bin/               qaf-check-quarantine (published as a bin, run in consumer CI)

  eslint-plugin-qaf/   @qaf/eslint-plugin-qaf — published to npm
    rules/             require-data-testid, no-console
    index.ts           plugin + `recommended` flat config

  rag-core/            @qaf/rag-core — published to npm, opt-in (not installed by default)
    embedding/         EmbeddingProvider interface + NoopEmbeddingProvider
    vector-store/      VectorStore interface + LocalJsonlVectorStore (dependency-free default)
    sources/           internal-specs, test-catalog, jira/confluence/zephyr (shape + adapters)
    indexing/          chunking + incremental (hash-diffed) embed/upsert/delete
    mapping/           spec-to-test nearest-neighbor coverage mapping
    failure-clustering/ stack-trace symbolization + CI failure root-cause clustering
    locator-healing/  createVectorHealingProvider() — the embedding-backed VectorHealingProvider
                       @qaf/core's resolve() calls; opt-in, can auto-execute (see
                       template/docs/locator-resolver.md)
    reporters/         coverage-report.md / root-cause-report.md renderers, FailureReporter
    bin/               qaf-rag-index / qaf-rag-map / qaf-rag-cluster

  graph-rag/           @qaf/graph-rag — published to npm, opt-in (not installed by default)
    graph/             GraphStore interface + LocalGraphStore (dependency-free, NetworkX-like
                       in-memory default) + Neo4jCompatibleGraphStore (Cypher over an injected
                       driver — works against Neo4j or Memgraph)
    ingestion/         OpenAPI/AsyncAPI contract parsers + test-file @covers docstring/tag
                       scanner -> Microservice/Endpoint/MessageQueue/DBTable/TestCase/UserStory
                       nodes and DEPENDS_ON/PRODUCES_EVENT/CONSUMES_EVENT/WRITES_TO/COVERS_TEST
                       edges; ingestAll() merges + synthesizes placeholder nodes for dangling edges
    impact/            PR-diff -> changed node resolution, per-edge-type impact propagation BFS,
                       COVERS_TEST-based regression test selection, impact_radius_score
    root-cause/        upstream DEPENDS_ON/event-chain BFS from a failing node + LocalIncidentStore
                       (reuses @qaf/rag-core's EmbeddingProvider/cosineSimilarity) to rank the
                       real root cause by log + historical-incident similarity
    reporters/         buildCiPayload() — the selected_tests/impact_radius_score/
                       root_cause_analysis JSON shape CI consumes
    bin/               qaf-graph-ingest / qaf-graph-impact / qaf-graph-diagnose

  synth-data/          @qaf/synth-data — published to npm, opt-in (not installed by default)
    ingestion/         Postgres DDL / Mongo $jsonSchema / OpenAPI components.schemas / plain
                       JSON Schema -> normalized EntitySchema (fields + FKs + business rules),
                       merged across sources by entity name
    registry/          EntitySchema -> embeddable ConstraintRule[] (the "Constraint Rules
                       Registry") + LocalConstraintStore (dependency-free default) + RAG
                       retrieval + reconstructEntitySchemas() (the registry as durable state)
    generation/        NL request -> RAG retrieval -> prompt -> LLMProvider.complete() ->
                       JSON extraction -> validate -> self-correction retry loop -> GenerationResult
    validation/         JSON-Schema-shaped structural/format checks, CPF/CNPJ mod-11 checksums,
                       RFC-3339/UUID format checks, FK-chain referential integrity across the
                       generated entity tree, and the generic self-correction retry loop
    isolation/         ephemeral per-worker isolation keys + defense-in-depth PII/synthetic-only
                       guards
    seeding/           SeedTarget: FK-respecting topological insert order + per-isolation-key
                       LIFO teardown, Postgres/Mongo adapters (inject your own driver) +
                       buildSqlInsertScript() for a plain-SQL alternative output
    api/               createSynthDataServer() — plain node:http REST API (POST /generate,
                       POST /teardown/:isolationKey); createSynthDataClient() is a TS convenience
                       wrapper, not a protocol requirement
    bin/               qaf-synth-ingest / qaf-synth-generate / qaf-synth-serve

  engine-contracts/    @qaf/engine-contracts — the AI-Driven QA Platform's Layer 3 seam:
                       RAGEngine/SelfHealingEngine/GraphRagEngine/SyntheticDataEngine
                       interfaces + adapters implementing each directly against rag-core/
                       graph-rag/synth-data/core; also GitAutoPrProvider (the "open a real PR"
                       hook self-healing didn't have before). See docs/ai-platform.md.

  storage-core/        @qaf/storage-core — Layer 4: ExecutionStore/TokenUsageStore/LogStore
                       interfaces (new) + Local/Postgres implementations, plus production
                       VectorStore adapters (Qdrant/Chroma/pgvector) and a Neo4j driver
                       wrapper for graph-rag's existing CypherDriver. See docs/ai-platform.md.

  llm-gateway/         @qaf/llm-gateway — Layer 5: unified LLM Gateway Router (OpenAI/
                       Anthropic/Ollama/LiteLLM), Token Audit Logger, PII Redaction
                       Middleware — createGatewayClient() composes all three. See
                       docs/ai-platform.md.

  create-qaf/          create-qaf — published to npm, scaffolding CLI
    src/               prompts, copy-template, tokenize, postinstall
    scripts/           sync-template.mjs — copies ../../template/ into ./template/
                       at build time (npm pack only includes files inside the
                       package directory, so the canonical template can't live
                       there directly)

template/              The canonical scaffold create-qaf copies + token-replaces.
                       Edit here, not inside packages/create-qaf/template (generated).

apps/                  Deployable services, not published to npm (see .changeset/config.json's
                       `ignore` list and pnpm-workspace.yaml's `apps/*` entry) — distinct from
                       packages/*, which is every importable library this monorepo ships.

  orchestrator/        @qaf/orchestrator — Layer 2: QAAgentOrchestrator, a LangGraph.js
                       StateGraph routing one CI failure across the four pillars via
                       @qaf/engine-contracts. See docs/ai-platform.md.

  gateway-api/         @qaf/gateway-api — Layer 1: MCP server (IDE integration) + Fastify
                       REST API + CI/CD webhooks, both fronting @qaf/orchestrator. The
                       service docker-compose.yml runs. See docs/ai-platform.md.
```

## Why a monorepo of published packages instead of a fork

A raw git fork means every team's copy diverges immediately and upstream fixes never flow
back. Publishing `@qaf/core`/`@qaf/eslint-plugin-qaf`/`create-qaf` via Changesets means a
generated repo gets framework improvements through `pnpm update` + a changelog, same as any
other dependency.

## Versioning relationship between create-qaf, @qaf/core, and @qaf/eslint-plugin-qaf

`create-qaf` depends on `@qaf/core` and `@qaf/eslint-plugin-qaf` at `workspace:*` — not
because it needs their code at runtime (it doesn't import framework internals), but so its
`postinstall` step can read their _exact resolved version_ and pin that same version into
the scaffolded project's `package.json`. See `packages/create-qaf/src/postinstall.ts`.

`@qaf/rag-core`, `@qaf/graph-rag`, and `@qaf/synth-data` are deliberately **not** part of this
pinning — all three are opt-in add-ons (embedding/LLM-provider API keys, and for `@qaf/graph-rag`
optionally a Neo4j/Memgraph connection, aren't something every team wants held), so a scaffolded
project never depends on any of them unless a team explicitly `pnpm add`s it. See
[rag-coverage.md](rag-coverage.md), [graph-rag.md](graph-rag.md), and
[synthetic-data-engine.md](synthetic-data-engine.md).

## See also

- [contributing.md](contributing.md) — adding a fixture/rule, running the monorepo's own checks
- [changesets.md](changesets.md) — the release flow
- [rag-coverage-plan.md](rag-coverage-plan.md) / [rag-coverage.md](rag-coverage.md) — the
  `@qaf/rag-core` design and usage
- [graph-rag.md](graph-rag.md) — the `@qaf/graph-rag` design and usage (SIT impact analysis +
  cascading root-cause diagnosis)
- [synthetic-data-engine.md](synthetic-data-engine.md) — the `@qaf/synth-data` design and usage
  (RAG-backed constraint registry + JIT synthetic data generation with a validate/self-correct
  guardrail loop)
- [ai-platform.md](ai-platform.md) — the 5-layer AI-Driven QA Platform built on top of all of
  the above: `apps/orchestrator`, `apps/gateway-api`, `@qaf/engine-contracts`,
  `@qaf/storage-core`, `@qaf/llm-gateway`, and the root `docker-compose.yml`
- [getting-started.md](getting-started.md) — the problem/benefits/quickstart/FAQ version of
  the above, written for someone encountering this platform for the first time

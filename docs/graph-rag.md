# GraphRAG for SIT impact analysis & root-cause diagnosis (`@qaf/graph-rag`)

`@qaf/graph-rag` models a system's integration-test topology as a graph — services, endpoints,
message queues, DB tables, tests, and user stories — and answers two questions a pure
spec-to-test embedding space (`@qaf/rag-core`) can't:

1. **PR impact analysis** — given a PR's changed endpoints/services/files, which regression tests
   are *strictly necessary* to run, and how big is the blast radius?
2. **Cascading root-cause diagnosis** — given a SIT failure (stack trace, the service it surfaced
   on, a timestamp), which *upstream* node is the real root cause, and how confident is that call?

Both outputs are **advisory only** — same posture as `@qaf/rag-core`: nothing here auto-skips
tests or auto-closes an incident. `impact_radius_score`/`selected_tests` are a CI gating *input*,
not a verdict; `root_cause_analysis`'s confidence is a similarity-based hint for the human
triaging the failure, not proof.

## Graph schema

```
Nodes:  Microservice · Endpoint · MessageQueue · DBTable · TestCase · UserStory
Edges:  (dependent)-[:DEPENDS_ON]->(dependency)
        (Microservice)-[:PRODUCES_EVENT]->(MessageQueue)
        (Microservice)-[:CONSUMES_EVENT]->(MessageQueue)
        (Microservice)-[:WRITES_TO]->(DBTable)
        (TestCase)-[:COVERS_TEST]->(anything)
```

`:DEPENDS_ON` is always dependent→dependency (an `Endpoint` depends on its owning `Microservice`
— ownership is modeled as a dependency, since the endpoint can't function without it). Impact
analysis walks it in reverse ("who depends on what changed"); root-cause diagnosis walks it
forward ("what does the failing node depend on"). See
[graph/traversal.ts](../packages/graph-rag/src/impact/traversal.ts) and
[root-cause/upstream.ts](../packages/graph-rag/src/root-cause/upstream.ts) for the exact rules per
edge type, including how `:PRODUCES_EVENT`/`:CONSUMES_EVENT` and `:WRITES_TO` propagate impact
without a direct `:DEPENDS_ON` edge.

## It's opt-in, and ships no real backend

- **`GraphStore`** — ships `LocalGraphStore` (dependency-free, an in-memory adjacency graph
  snapshotted to `.qaf/graph-index/graph.json` — the same role NetworkX plays in a Python stack)
  and `Neo4jCompatibleGraphStore` (generates Cypher over an injected `CypherDriver`, works against
  Neo4j *or* Memgraph unchanged since both speak Cypher — no `neo4j-driver` dependency added to
  this package, wire your own driver's `.run()`).
- **`EmbeddingProvider`** — root-cause diagnosis reuses `@qaf/rag-core`'s provider interface and
  `NoopEmbeddingProvider` directly rather than redefining it. Wire a real one the same way as
  `@qaf/rag-core` (`docs/rag-coverage.md`'s example), pointed at via this package's own
  `QAF_GRAPH_PROVIDER_MODULE` (kept separate from `QAF_RAG_PROVIDER_MODULE` — a team may want a
  different model for root-cause diagnosis than for spec-to-test coverage).

## Ingestion

Three ingestors, each "shape only" — no HTTP client, no YAML parser, same posture as
`@qaf/rag-core`'s `sources/jira.ts`. Parse your own OpenAPI/AsyncAPI YAML (`js-yaml`,
`@apidevtools/swagger-parser`, whatever you already use) and pass the resulting object in.

- **`ingestOpenApiContracts`** — one `Microservice` node per input, one `Endpoint` node per
  path+method (`Endpoint -DEPENDS_ON-> Microservice`). Cross-service dependencies and DB writes
  are **contract-declared**, not inferred from `$ref`/schema shape (nothing in an OpenAPI document
  says *who* calls it) — set the vendor extensions `x-qaf-depends-on` (root-level, applies to the
  whole service, or per-operation) and `x-qaf-writes-to` (per-operation) to declare them.
- **`ingestAsyncApiContracts`** — one `MessageQueue` node per channel; `publish` →
  `Microservice -PRODUCES_EVENT-> MessageQueue`, `subscribe` →
  `Microservice -CONSUMES_EVENT-> MessageQueue`, using AsyncAPI's own vocabulary (operations named
  from *this* service's perspective).
- **`ingestTestCatalog`** — regex-scans raw spec-file source (not `playwright --list` output) for
  `@covers <nodeRef>` directives: a JSDoc block comment immediately above a `test(...)` call
  (`@covers service:orders-service`, one directive per line), or an inline tag
  (`test("...", { tag: ["@covers:service:orders-service"] }, ...)`). `nodeRef` is
  `<kind>:<name>` — `service:`, `endpoint:<service>:<METHOD> <path>`, `queue:`, `table:`, or
  `story:` (for a `UserStory`, e.g. `story:JIRA-123`).

`ingestAll` runs every configured ingestor, merges nodes (by id, later metadata merged on top of
earlier) and edges (by `from`+`to`+`type`), and — this is the part that makes ingestion-order
not matter — **synthesizes a placeholder node** for any edge endpoint no ingestor declared (e.g. a
service that only showed up via an AsyncAPI `CONSUMES_EVENT` edge in this run, never through its
own OpenAPI contract). Placeholders are tagged `metadata.inferred: true` and listed in
`IngestSummary.inferredNodeIds` — a signal that *some* contract for that node is still missing
from your ingestion inputs, not something to silently ignore.

```bash
# qaf-graph-sources.json:
# { "openapi": [{ "serviceName": "orders-service", "documentPath": "services/orders/openapi.json",
#                  "sourceFile": "services/orders/openapi.json" }],
#   "asyncapi": [...], "testCatalogFiles": ["tests/orders/orders.spec.ts", ...] }
QAF_GRAPH_SOURCES_PATH=qaf-graph-sources.json qaf-graph-ingest
```

## PR impact analysis

```bash
# qaf-graph-changed-refs.json: ["service:orders-service"] or ["services/orders/openapi.json"]
# — an explicit node ref, or a changed file path matched against ingested nodes' metadata.sourceFile
QAF_GRAPH_CHANGED_REFS_PATH=qaf-graph-changed-refs.json \
QAF_GRAPH_MAX_DEPTH=3 \
QAF_GRAPH_IMPACT_OUTPUT_PATH=qaf-graph-impact.json \
qaf-graph-impact
```

Prints (and optionally writes) requirement #4's payload with `root_cause_analysis: null` — this
runs pre-merge, before any SIT failure exists:

```json
{
  "selected_tests": ["tests/orders/orders.spec.ts::creates an order"],
  "impact_radius_score": 0.18,
  "root_cause_analysis": null
}
```

`impact_radius_score` is the fraction of *system* nodes (everything except `TestCase`/`UserStory`)
reachable from the change within `maxDepth` hops — 0 means fully isolated, 1 means the change
reaches the whole graph. A simple, auditable metric on purpose (see
[impact/traversal.ts](../packages/graph-rag/src/impact/traversal.ts)'s
`computeImpactRadiusScore`) — this is a CI gating input, not a place for an opaque score.

A changed ref that resolves to nothing (`unresolvedRefs`) prints a `::warning` annotation instead
of being silently dropped — it means the graph may be stale for that ref, not that the PR has zero
impact there.

## Cascading root-cause diagnosis

```bash
# qaf-graph-failure.json:
# { "failingNodeId": "service:shipping-service", "stackTrace": "...", "timestamp": "...",
#   "serviceLogs": { "service:orders-service": "<recent log/error excerpt>" } }
QAF_GRAPH_FAILURE_PATH=qaf-graph-failure.json \
QAF_GRAPH_PROVIDER_MODULE=./embedding-provider.ts \
QAF_GRAPH_IMPACT_OUTPUT_PATH=qaf-graph-impact.json \
qaf-graph-diagnose
```

Walks upstream from `failingNodeId` (forward along `:DEPENDS_ON`, and through
`:CONSUMES_EVENT`→queue→`:PRODUCES_EVENT` for event-driven dependencies — never `:WRITES_TO`, a
co-writer is a peer, not something the failing node depends on) up to `maxDepth` hops, and ranks
every candidate (the origin included, at depth 0) by a 50/50 blend of two cosine similarities
against the failure's embedded signature:

1. The candidate's own recent log/error text, if supplied in `serviceLogs`.
2. The nearest historical incident previously attributed to that candidate
   (`LocalIncidentStore` — same JSONL-snapshot, brute-force-cosine shape as `@qaf/rag-core`'s
   `LocalJsonlVectorStore`, kept as its own minimal store since incident records carry a `nodeId`
   attribution `VectorRecord`'s closed `VectorNamespace` union doesn't have room for).

A small per-hop score penalty (tunable, `DEPTH_PENALTY_PER_HOP` in
[root-cause/diagnose.ts](../packages/graph-rag/src/root-cause/diagnose.ts)) breaks ties toward
closer candidates — it's a preference, not a cutoff; a distant node with genuinely stronger
evidence still wins. Below `minConfidence` (default 40%), `recommended_action` says so explicitly
instead of asserting a confident-sounding root cause off weak evidence.

```json
{
  "selected_tests": ["..."],
  "impact_radius_score": 0.18,
  "root_cause_analysis": {
    "origin_node": "service:shipping-service",
    "root_cause_node": "service:orders-service",
    "confidence": 82,
    "recommended_action": "Contract/behavior regression suspected in \"orders-service\" (upstream dependency of \"shipping-service\"); verify its latest deploy or contract change before treating \"shipping-service\" as the faulty service."
  }
}
```

Recording an incident once triaged (so the *next* similar failure ranks higher/faster) is a
one-off script against `LocalIncidentStore.upsert()` — there's no CLI for it yet, matching
`@qaf/rag-core`'s stance that labeling a cluster's root cause is a manual step (see
`docs/rag-coverage.md`'s clustering walkthrough).

## When to graduate off `LocalGraphStore`

Same tradeoff as `LocalJsonlVectorStore`: fine at single-team scale (a service topology is
hundreds, not millions, of nodes — the whole graph loads into memory and every traversal is an
in-process BFS). Once a team wants Cypher query access from other tools, multi-writer
concurrency, or a graph too large to hold in memory, implement `GraphStore` against a real
driver — `Neo4jCompatibleGraphStore` already does this for anything Cypher-compatible (Neo4j,
Memgraph); swap the constructor call in your `qaf-graph-*` invocations, nothing else changes.

## See also

- [architecture.md](architecture.md) — where this package sits in the monorepo
- [rag-coverage.md](rag-coverage.md) — the sibling package this one borrows its opt-in-provider
  and local-JSONL-store conventions from
- [../packages/graph-rag/src/index.ts](../packages/graph-rag/src/index.ts) — full public API

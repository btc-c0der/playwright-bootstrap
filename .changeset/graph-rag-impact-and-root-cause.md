---
"@qaf/graph-rag": minor
---

Add `@qaf/graph-rag`: opt-in GraphRAG for SIT impact analysis and cascading root-cause diagnosis.
Ingests OpenAPI/Swagger contracts, AsyncAPI-shaped queue schemas, and `@covers` docstring/tag
annotations in test files into a system-topology graph (`Microservice`/`Endpoint`/`MessageQueue`/
`DBTable`/`TestCase`/`UserStory` nodes; `DEPENDS_ON`/`PRODUCES_EVENT`/`CONSUMES_EVENT`/`WRITES_TO`/
`COVERS_TEST` edges). Given a PR's changed endpoints/services/files, walks the blast radius up to
N hops and selects the strictly-necessary regression test subset plus an `impact_radius_score`.
Given a SIT failure (stack trace, origin service, timestamp), walks upstream dependencies/event
chains and ranks candidates by log + historical-incident cosine similarity (reusing
`@qaf/rag-core`'s `EmbeddingProvider`) to isolate the real root cause with a confidence score and
a recommended action. Exports a single JSON payload (`selected_tests`, `impact_radius_score`,
`root_cause_analysis`) for CI/CD consumption. Ships only `LocalGraphStore` (dependency-free,
NetworkX-like in-memory graph) and `LocalIncidentStore`; `Neo4jCompatibleGraphStore` generates
Cypher over an injected driver for teams that want Neo4j or Memgraph. See `docs/graph-rag.md`.

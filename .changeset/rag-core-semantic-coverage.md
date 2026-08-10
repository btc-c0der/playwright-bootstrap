---
"@qaf/rag-core": minor
---

Add `@qaf/rag-core`: opt-in RAG semantic coverage. Embeds internal specs, Jira issues,
Confluence pages, Zephyr test cases, and the test suite itself into a shared vector space to
compute spec-to-test coverage mapping (gaps/orphans) and CI failure root-cause clustering
(symbolized stack-trace similarity against failure history). Ships only a `NoopEmbeddingProvider`
and a dependency-free `LocalJsonlVectorStore` — wiring a real embedding backend is a
consuming-repo choice, same posture as the existing `AiRepairProvider` hook. See
`docs/rag-coverage-plan.md` and `docs/rag-coverage.md`.

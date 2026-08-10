---
"@qaf/core": minor
"@qaf/rag-core": minor
---

Add vector-based locator healing: a second, separate opt-in hook alongside the existing
AI-repair suggestion step. `@qaf/core`'s `resolve()` now fingerprints the winning element on
every successful resolution (`VectorHealingProvider.captureOnSuccess`) and, once every static
strategy is exhausted, fingerprints every currently-interactive element on the page and asks the
provider for the closest semantic match (`VectorHealingProvider.attemptHeal`). Confidence-scored
matches are always logged and appended to `vector-healing-suggestions.jsonl` as a human-readable
before/after patch (`QAF_VECTOR_HEALING_ENABLED=true`). Unlike AI-repair, a match can optionally
be used in place of throwing — `QAF_VECTOR_HEALING_AUTO_EXECUTE=true` plus a confidence at/above
`QAF_VECTOR_HEALING_MIN_CONFIDENCE` (default `0.85`) hands `resolve()` a substitute `Locator`
instead of failing the run. This is a real behavior change from this framework's prior "advisory
only, never applied" posture — it is opt-in, off by default, and documented with its tradeoffs in
`template/docs/locator-resolver.md`.

`@qaf/core` ships only `NoopVectorHealingProvider` (heals nothing) plus the DOM-snapshot/recipe
plumbing. `@qaf/rag-core` ships the real, embedding-backed implementation
(`createVectorHealingProvider`), reusing its existing `EmbeddingProvider`/`VectorStore`/
`cosineSimilarity` primitives against a new `"locator"` vector namespace — same
no-default-API-key, pluggable-provider posture as RAG indexing and the existing AI-repair hook.

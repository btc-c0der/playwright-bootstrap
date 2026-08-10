---
"@qaf/synth-data": minor
---

Add `@qaf/synth-data`: an opt-in AI-driven synthetic test data generation engine for SIT.
Ingests PostgreSQL DDL, MongoDB `$jsonSchema` validators, OpenAPI `components.schemas`, and plain
JSON Schema into a normalized `EntitySchema` (fields, foreign keys, business rules), embeds it as
a "Constraint Rules Registry" (ships `LocalConstraintStore`, dependency-free), and exposes a REST
API (`POST /generate`) plus a one-shot CLI (`qaf-synth-generate`) that turn a natural-language
request ("a corporate account user from Santa Catarina with a suspended state registration,
negative balance, and 3 failed PIX attempts") into a validated, relational JSON payload via
RAG-retrieved constraints + an `LLMProvider` completion. Every generated payload is checked by a
guardrail layer (structural/format validation, CPF/CNPJ mod-11 checksums, RFC-3339/UUID format
checks, foreign-key chain integrity across the generated entity tree) before being served, with
a self-correction retry loop (max 3 retries) that feeds validation errors back into the prompt.
Each bundle carries an ephemeral per-worker `isolation_key` (UUID) so parallel CI/CD runs never
collide; `SeedTarget` (Postgres/Mongo adapters, inject your own driver) inserts the generated
tree in FK-respecting order and tears it down LIFO by isolation key, or `buildSqlInsertScript()`
renders the same tree as a plain SQL insert script with no live connection needed. 100% synthetic
by construction — ingestion reads schema definitions only, never real rows — with defense-in-depth
guards (`assertSyntheticSource`, `assertNoDeniedValues`) on top. See `docs/synthetic-data-engine.md`.

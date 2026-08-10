# AI-driven synthetic test data generation (`@qaf/synth-data`)

`@qaf/synth-data` turns a running test's natural-language data request — *"a corporate account
user from Santa Catarina with a suspended state registration, negative balance, and 3 failed PIX
attempts"* — into a validated, relational JSON (or SQL) payload, scoped to that test's own
isolation key, ready to seed into a staging target and tear back down. It's the SIT-facing half
of this monorepo's RAG story: `@qaf/rag-core` embeds specs/tests for coverage mapping,
`@qaf/graph-rag` models system topology for impact analysis, and this package embeds **schema
constraints** so an LLM can generate data that actually respects them.

Same posture as both of those: **opt-in**, ships only local/no-op defaults, and nothing here
reads a single row of real data — see [LGPD/GDPR](#lgpdgdpr-and-test-environment-isolation) below.

## Pipeline

```
ingestion/        Postgres DDL, Mongo $jsonSchema validators, OpenAPI components.schemas,
                  and plain JSON Schema -> a normalized EntitySchema (fields + FKs + business
                  rules), merged across sources by entity name (merge.ts)

registry/         EntitySchema -> ConstraintRule[] (one per field/FK/business-rule/entity
                  summary) -> embedded into a "Constraint Rules Registry" (LocalConstraintStore
                  by default). retrieveConstraints() is the RAG half of generation.
                  reconstructEntitySchemas() rebuilds EntitySchema[] from the registry itself —
                  the exact inverse of derivation — so a later process (qaf-synth-generate,
                  qaf-synth-serve) never has to re-parse the original DDL/OpenAPI files.

generation/       NL request -> retrieveConstraints() -> buildGenerationPrompt() -> LLMProvider
                  .complete() -> extractJson() -> validatePayload() -> self-correction retry
                  loop (max 3 retries, requirement 3) -> GenerationResult

validation/       json-schema-validator.ts (structural/format), brazilian-documents.ts
                  (CPF/CNPJ mod-11 checksums), format-validators.ts (RFC-3339, UUID),
                  referential-integrity.ts (FK chains across the generated entity tree, with
                  an optional async hook to check a staging target for FKs the tree doesn't
                  generate itself), validate.ts (composes all of the above),
                  self-correct.ts (the generic retry loop)

isolation/        createIsolationContext() — an ephemeral UUID per worker/run, folded into
                  generated unique fields via scopeUniqueValue(); pii-guard.ts's defense-in-depth
                  checks (see LGPD/GDPR section)

seeding/          SeedTarget: FK-respecting topological insertion order + per-isolation-key LIFO
                  teardown, built once in seed-target.ts and reused by the Postgres/Mongo
                  adapters (inject your own driver, same posture as @qaf/graph-rag's
                  Neo4jCompatibleGraphStore). buildSqlInsertScript() renders the same tree as a
                  plain SQL string instead, with no live connection needed.

api/              createSynthDataServer() — plain node:http REST API (POST /generate,
                  POST /teardown/:isolationKey, GET /health). No web framework dependency,
                  and no client library requirement either: any language calls this like any
                  other HTTP/JSON API (createSynthDataClient() is a TS convenience wrapper,
                  not a protocol requirement — see the Python example below).

bin/              qaf-synth-ingest / qaf-synth-generate / qaf-synth-serve
```

## It's opt-in, and ships no real backend

Nothing runs unless `QAF_SYNTH_ENABLED=true` is set for `qaf-synth-ingest`. Three provider
interfaces you wire yourself, each via a module-path env var (same mechanism as
`@qaf/rag-core`'s `QAF_RAG_PROVIDER_MODULE`):

- **`EmbeddingProvider`** (`QAF_SYNTH_EMBEDDING_PROVIDER_MODULE`) — reused directly from
  `@qaf/rag-core`, not redefined. See docs/rag-coverage.md's OpenAI example; the same module
  works here.
- **`LLMProvider`** (`QAF_SYNTH_LLM_PROVIDER_MODULE`) — this package's own interface (`id`,
  `complete(prompt, options?)`). Example:

  ```ts
  // synth-llm-provider.ts
  import Anthropic from "@anthropic-ai/sdk";
  import type { LLMProvider } from "@qaf/synth-data";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  export default {
    id: "anthropic:claude-sonnet-5",
    async complete(prompt, options) {
      const res = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: options?.maxOutputTokens ?? 2048,
        temperature: options?.temperature,
        messages: [{ role: "user", content: prompt }],
      });
      return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    },
  } satisfies LLMProvider;
  ```

  A local model via Ollama works the same way — `complete()` just needs to hit
  `http://localhost:11434/api/generate` instead.

- **`SeedTarget`** (`QAF_SYNTH_SEED_TARGET_MODULE`, optional) — only needed if `qaf-synth-serve`
  should actually write to a staging database. Omit it and `/generate` still works;
  `/teardown/:isolationKey` returns 501. Example:

  ```ts
  // synth-seed-target.ts
  import { Pool } from "pg";
  import { createPostgresSeedTarget } from "@qaf/synth-data";

  const pool = new Pool({ connectionString: process.env.STAGING_DATABASE_URL });
  export default createPostgresSeedTarget(pool);
  ```

- **`ConstraintVectorStore`** — ships `LocalConstraintStore` (one JSONL file, brute-force cosine
  similarity), the same tradeoffs as `@qaf/rag-core`'s `LocalJsonlVectorStore`. Swap in a
  ChromaDB/Qdrant-backed store by implementing the same four-method interface once corpus size
  warrants it.

## End-to-end example

```bash
# 1. Ingest schemas + embed the Constraint Rules Registry
QAF_SYNTH_ENABLED=true \
QAF_SYNTH_POSTGRES_DDL_PATHS=./db/schema.sql \
QAF_SYNTH_EMBEDDING_PROVIDER_MODULE=./synth-embedding-provider.ts \
npx qaf-synth-ingest

# 2. Ask for data in plain language
QAF_SYNTH_EMBEDDING_PROVIDER_MODULE=./synth-embedding-provider.ts \
QAF_SYNTH_LLM_PROVIDER_MODULE=./synth-llm-provider.ts \
npx qaf-synth-generate accounts \
  "a corporate account user from Santa Catarina with a suspended state registration, negative balance, and 3 failed PIX attempts"
```

```json
{
  "generated_data": {
    "users": { "id": "…", "region": "SC" },
    "accounts": { "id": "…", "user_id": "…", "cnpj": "04.252.011/0001-10", "balance": -842.50, "state_registration_status": "SUSPENDED" },
    "pix_attempts": [
      { "account_id": "…", "status": "FAILED" },
      { "account_id": "…", "status": "FAILED" },
      { "account_id": "…", "status": "FAILED" }
    ]
  },
  "validation_status": true,
  "isolation_key": "6f2b0e2a-....",
  "attempts": 1,
  "issues": []
}
```

Or drive it over HTTP from any language, including a running test suite:

```python
# from a Python test suite — no client library needed
import requests

res = requests.post("http://localhost:4600/generate", json={
    "request": "a suspended corporate account with 3 failed PIX attempts",
    "primaryEntity": "accounts",
    "workerId": os.environ["PYTEST_XDIST_WORKER"],
})
bundle = res.json()
...
requests.post(f"http://localhost:4600/teardown/{bundle['isolation_key']}")
```

## The self-correction loop

`generateSyntheticPayload()` runs every LLM completion through
`validation/validate.ts` (structural/format checks, CPF/CNPJ checksums, RFC-3339/UUID formats,
FK chain integrity) before it's ever returned. A failing attempt's error trace is fed straight
back into the next prompt (`prompt-builder.ts`'s "Your previous attempt failed validation"
section) for up to 3 retries (`validation/self-correct.ts`, 4 attempts total). Exhausting retries
still returns the last attempt with `validation_status: false` rather than throwing —
`seeding/seed-target.ts`'s `seed()` refuses to insert anything with that flag set, so a bad
payload can surface in a test assertion but can never reach a staging database.

## LGPD/GDPR and test environment isolation

- **Zero production PII, by construction.** Ingestion (`ingestion/`) only ever reads schema/DDL/
  OpenAPI/JSON-Schema *definitions* — column names, types, constraints — never a row of real
  data. Generation (`generation/generate.ts`) only ever sends the LLM a natural-language request
  plus retrieved constraint *descriptions*. Nothing in this pipeline samples live rows to infer
  shape. `isolation/pii-guard.ts` adds defense-in-depth on top of that: `assertSyntheticSource()`
  refuses an ingestion input explicitly labeled as a production sample, and
  `assertNoDeniedValues()` scans a generated payload against an optional real-value denylist —
  catching the one way a real value could still leak in, a business rule's hand-authored free
  text quoting a real example.
- **Dynamic entity scoping.** `createIsolationContext({ workerId, runId })` mints a fresh UUID
  per generation call — the `isolation_key` returned in every result. `scopeUniqueValue()` folds
  its first 8 hex chars into generated unique fields (emails, external reference codes) so
  parallel CI workers' data can never collide, the same instinct as `@qaf/core`'s
  `buildWorkerNamespace`/`buildTestNamespace`, generalized to work from a plain REST caller with
  no Playwright fixtures at all.
- **Seed/teardown symmetry.** `seeding/seed-target.ts`'s `createSeedTarget()` tracks every row it
  inserts, keyed by `isolation_key`, in FK-respecting parent-first order; `teardown()` deletes
  them children-first (LIFO) and never throws on a failed delete — a failure is recorded, not
  swallowed, so orphaned rows stay visible to a health-report style audit instead of silently
  accumulating in a shared staging database.

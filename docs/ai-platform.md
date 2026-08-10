# The AI-Driven QA Platform (5-layer blueprint)

> Looking for the problem statement, benefits, and a quickstart instead of the class-level
> tour? Start with [getting-started.md](getting-started.md) — this doc assumes you already
> know what RAG/GraphRAG/self-healing/synthetic-data engines are and want the package-level
> detail.

This monorepo's four opt-in engine packages (`@qaf/rag-core`, `@qaf/graph-rag`,
`@qaf/synth-data`, and `@qaf/core`'s locator-resolver) already implement three of the
industry-standard "4 pillars" of an AI-driven QA platform — RAG coverage/triage, GraphRAG
impact/root-cause, synthetic data generation, and self-healing locators. What they didn't
have was a service shell around them: a way to trigger the whole pipeline from a CI/CD
webhook or an IDE, a way to route a single failure across all four pillars automatically,
and a unified LLM/security boundary. This doc covers what closes that gap, mapped onto the
standard 5-layer container blueprint:

```
1. Consumers & Entrypoints   apps/gateway-api        MCP server + REST API + CI/CD webhooks
2. Orchestration & Agents    apps/orchestrator        QAAgentOrchestrator (LangGraph.js StateGraph)
3. Core AI Engines           packages/engine-contracts + the existing engine packages
4. Data & Storage            packages/storage-core + the existing VectorStore/GraphStore
5. Foundation & Security     packages/llm-gateway     unified LLM router, token audit, PII redaction
```

Everything here is additive — none of the existing published packages changed shape. See
[architecture.md](architecture.md) for how these fit into the monorepo's package layout,
and [contributing.md](contributing.md) for the general "opt-in, dependency-free default"
conventions every package here follows.

## Layer 3 — `@qaf/engine-contracts`

The seam `@qaf/orchestrator` depends on instead of importing `@qaf/rag-core`/
`@qaf/graph-rag`/`@qaf/synth-data`/`@qaf/core` directly: `RAGEngine`, `SelfHealingEngine`,
`GraphRagEngine`, `SyntheticDataEngine`. Each has one adapter (`RagCoreEngine`,
`CoreSelfHealingEngine`, `GraphRagEngineAdapter`, `SynthDataEngineAdapter`) implementing it
directly against the real package — no new engine logic, just a contract that survives a
pillar's internals changing. It also adds the one genuinely new capability the platform
needed: `GitAutoPrProvider` (`NoopGitAutoPrProvider` / `GhCliAutoPrProvider`), which turns a
confirmed locator repair into an actual pull request instead of a suggestion file — `@qaf/core`
itself only ever proposes, by design.

## Layer 2 — `@qaf/orchestrator`

`QAAgentOrchestrator` wraps a LangGraph.js `StateGraph` (`buildQaWorkflowGraph`) that walks:

```
impactAnalysis -> dataGeneration -> testExecution --pass--> END
                                             \
                                              --fail--> healing -> rootCauseAnalysis -> END
```

Every stage's `EngineContext` (an interface `@qaf/engine-contracts` also defines) carries a
`runId` that threads through to `@qaf/storage-core`'s `ExecutionStore`, so "what happened
during run X" is reconstructable after the fact. `testExecutionNode` takes an injectable
`TestRunner` — this orchestrator has no Playwright dependency of its own; a real `TestRunner`
shells out to `npx playwright test` (or a worker pool) and parses the result. `StubTestRunner`
(the default) reproduces the original CI failure so the pipeline is exercisable without a live
browser — see `apps/gateway-api/src/scripts/demo-e2e-flow.ts`.

## Layer 1 — `@qaf/gateway-api`

Two entrypoints onto the same `QAAgentOrchestrator`:

- **MCP server** (`bin/mcp-server.ts`, stdio transport) — the IDE-integration surface. Tools:
  `trigger_qa_workflow`, `analyze_pr_impact`, `get_execution_history`.
- **REST API** (`bin/rest-server.ts`, Fastify) — `POST /webhooks/github-actions`,
  `POST /webhooks/azure-devops` (both normalize a CI-specific payload into the shared
  `CiFailurePayload` shape before calling the orchestrator), `POST /api/v1/qa-runs` (direct
  trigger), `GET /api/v1/qa-runs/:runId` (history lookup).

`src/config.ts`'s `buildDefaultEngines()` wires every pillar to its local/no-op default —
the same "works with nothing configured" posture as the rest of this monorepo — so both
entrypoints run with zero external services. `buildEnginesWithGateway()` is the production
counterpart: every pillar's LLM/embedding calls go through one shared `@qaf/llm-gateway`
client instead (see Layer 5, below) — swap in whichever of the two `bin/*.ts` calls, or
construct your own `QAOrchestratorEngines` with `@qaf/storage-core`'s adapters directly.

## Layer 4 — `@qaf/storage-core`

Two things:

1. **New relational/document interfaces** this platform needed that no existing package
   defined: `ExecutionStore`, `TokenUsageStore`, `LogStore` — each with a `Local*Store`
   (append-only JSONL, same convention as `@qaf/core`'s `test-run-history.jsonl`) and a
   `Postgres*Store` (plain SQL over an injected `SqlExecutor` — see `schema.sql`).
2. **Production adapters for interfaces that already existed** but only shipped local
   defaults: `QdrantVectorStore` / `ChromaVectorStore` / `PgVectorStore` (all implement
   `@qaf/rag-core`'s `VectorStore`), and `createNeo4jCypherDriver` (wraps a real
   `neo4j-driver` session into `@qaf/graph-rag`'s `CypherDriver`, which
   `Neo4jCompatibleGraphStore` already knew how to consume — this package just supplies the
   driver, not new graph logic).

Every adapter is dependency-injected (a driver, a client, a `fetch` base URL) — this
package adds zero hard SDK dependencies, same posture as `@qaf/rag-core`'s
`LocalJsonlVectorStore`.

## Layer 5 — `@qaf/llm-gateway`

`createGatewayClient()` composes redaction, audit, and routing into a `GatewayClient` —
`{ llm, embeddings }`, one gateway per capability, since embeddings and chat completions are
genuinely different APIs (even within one provider — OpenAI's `/embeddings` isn't
`/chat/completions`):

```
request -> PiiRedactionMiddleware -> TokenAuditLogger -> LLMGatewayRouter        -> provider
request -> EmbeddingPiiRedactionMiddleware -> EmbeddingAuditLogger -> EmbeddingGatewayRouter -> provider
```

Both routers dispatch on `request.model`'s `"<prefix>:<model-name>"` shape to whichever
provider owns that prefix — `OpenAiCompatibleProvider`/`OpenAiCompatibleEmbeddingProvider`
(OpenAI itself, Ollama's OpenAI-compatible endpoints, or a LiteLLM proxy all speak this same
wire format) and `AnthropicProvider` (completions only — Anthropic has no embeddings API)
ship built in, all plain `fetch`, no SDK dependency. Redaction runs before a provider ever
sees a payload (emails/phone/SSN/credit-card/IPv4, tunable, and multimodal-aware — only text
content parts are redacted, an attached image passes through); audit runs after, recording
*what the provider actually received* into one shared `TokenUsageSink` for both completions
and embeddings (structurally compatible with `@qaf/storage-core`'s `TokenUsageStore` — no
hard dependency between the two packages). `ChatMessage.content` can be a plain string or
`ContentPart[]` (text + inline base64 images) — the multimodal case exists specifically for
`GatewayAiRepairProvider` below, which attaches a screenshot.

### Every pillar's LLM call goes through the one gateway

`@qaf/engine-contracts`'s `gateway-adapters/` implement each pillar's *own* provider
interface directly over a `GatewayClient`, instead of that pillar holding an unaudited
provider of its own:

| Pillar's own interface | Bridge over the gateway | Backs |
|---|---|---|
| `@qaf/rag-core`'s `EmbeddingProvider` | `GatewayEmbeddingProvider` | RAG coverage/triage's *and* GraphRAG root-cause's embedding calls (they share one instance) |
| `@qaf/synth-data`'s `LLMProvider` | `GatewayLLMProvider` | synthetic-data generation completions |
| `@qaf/core`'s `AiRepairProvider` | `GatewayAiRepairProvider` | locator-repair completions — sends the descriptor + DOM as text and the screenshot as an inline image, requires a vision-capable model |

`apps/gateway-api/src/config.ts`'s `buildEnginesWithGateway(options)` is the one-call way to
get this: pass it a `GatewayClient` plus which model handles completions vs. embeddings, and
every pillar that needs an LLM gets wired to the *same* gateway. The payoff is a single
`TokenUsageStore` ending up with every pillar's spend, attributable by `requestedBy`
(`"synth-data-engine"`, `"self-healing-engine"`, ...) — see
`apps/gateway-api/src/scripts/demo-e2e-flow.ts`, which runs a full orchestrator pass through
one shared gateway and then prints exactly that breakdown. `vectorHealingProvider` and
`gitAutoPrProvider` aren't LLM calls, so `buildEnginesWithGateway` leaves them at their local/
no-op defaults — override them yourself if you want those wired to something real too.

## Running it locally

```bash
pnpm install && pnpm build

# Zero-config: MCP server (IDE) or REST server (CI/CD), no Docker needed
pnpm --filter @qaf/gateway-api start          # REST on :3000
pnpm --filter @qaf/gateway-api start:mcp      # MCP over stdio

# End-to-end demo: a CI failure payload traveling Layer 1 -> Layer 5
pnpm --filter @qaf/gateway-api demo

# Production data services (Postgres, Neo4j, ChromaDB) + the service itself
docker compose up --build
```

## What this doesn't do (yet)

- `buildDefaultEngines()`'s zero-config wiring runs every pillar on local/no-op backends;
  production adapters exist (`@qaf/storage-core`, `@qaf/llm-gateway`) but nothing auto-detects
  or requires them — you opt in by calling `buildEnginesWithGateway()` (or constructing your
  own `QAOrchestratorEngines`) instead.
- `TestRunner` has no real Playwright-backed implementation in this repo — `StubTestRunner`
  is a fixture for exercising the graph, not a production test executor.
- Per-call `requestedBy` attribution in the shared audit trail is coarser for embeddings than
  for completions: `@qaf/rag-core`'s `EmbeddingProvider.embed(texts)` interface has no
  per-call metadata parameter, and RAG coverage/triage and GraphRAG root-cause share one
  `GatewayEmbeddingProvider` instance, so their embedding calls land in `TokenUsageStore`
  unattributed rather than split by pillar.

# Getting started with the AI-Driven QA Platform

New here — from a LinkedIn post, a share, a search? Start here. If you already know what
RAG/GraphRAG/self-healing/synthetic-data engines are and just want the class-level tour,
skip straight to [ai-platform.md](ai-platform.md).

## The problem this solves

If you test anything beyond a single service, you already know these five costs:

1. **Triage tax.** A CI run fails. Which of the 40 changed files actually caused it? Usually
   the answer is "run the whole suite and see" — slow, and it still doesn't tell you *why*.
2. **Locator tax.** Every UI refactor breaks a pile of selectors. Someone spends an afternoon
   diffing DOM snapshots and re-writing `data-testid` chains by hand.
3. **Blast-radius guesswork.** A PR touches `payment-service`. Which regression tests actually
   cover it — directly or through something downstream? Most teams either run everything
   (slow) or trust a human's memory of the system (risky).
4. **Test-data tax.** System Integration Testing needs *relational* data — a user, the account
   it owns, the transactions on that account — not a single flat fixture. Hand-authoring that,
   keeping it isolated per test run, and cleaning it up afterward is its own job.
5. **The governance wall.** The moment anyone proposes "let's use an LLM to help with 1–4,"
   security asks what data left the network and how you'd prove it. Most AI-QA demos have no
   answer to that question — which is usually where adoption stalls, not at the technology.

This repo is a working, source-available answer to all five — not a slide deck, a runnable
reference implementation you can read every line of.

## What it actually is

Four AI engines (the "4 pillars"), each solving one of problems 1–4 above, sitting behind one
orchestrator and one audited LLM boundary that solves problem 5:

| Pillar | Solves | How |
|---|---|---|
| **RAG Engine** | "Which requirements have no test?" | Embeds specs (Jira/Confluence/Zephyr/internal docs) and tests into one vector space; reports coverage gaps and orphan tests. Also clusters recurring CI failures by embedding similarity, so "seen this before" is a lookup, not a memory test. |
| **GraphRAG Engine** | Blast-radius guesswork + triage tax | Builds a real topology graph (services, endpoints, queues, tables, tests) from your OpenAPI/AsyncAPI contracts. A PR's changed refs walk the graph to the exact regression-test subset (not "everything"); a failure walks it *upstream* and ranks root-cause candidates by log + historical-incident similarity, with a confidence score. |
| **Synthetic Data Engine** | Test-data tax | Ingests your Postgres DDL / Mongo schema / OpenAPI schemas into a constraint registry, then generates a relational entity tree from a plain-English request — FK integrity checked, PII-guarded, isolated per worker, torn down automatically. |
| **Self-Healing Interceptor** | Locator tax | DOM-fingerprint + cosine-similarity matching finds the element a broken locator meant to find; a confirmed repair opens an actual pull request instead of a suggestion nobody reads. |
| **Foundation & Security Gateway** | The governance wall | Every one of the above routes its LLM/embedding calls through *one* gateway: PII redaction before anything leaves the process, then a single audited trail of exactly what was sent, to which model, by which engine, for how many tokens. |

This is squarely **advanced System Integration Testing** territory, not single-service UI
testing: cross-service impact graphs, cascading root-cause analysis, and governed relational
test data are SIT problems, and they're the ones this platform targets first.

See [ai-platform.md](ai-platform.md) for the exact 5-layer container blueprint (Consumers &
Entrypoints → Orchestration → Core AI Engines → Data & Storage → Foundation & Security) and
which package implements which layer.

## 5-minute quickstart

No API keys, no Docker, no cloud account — everything below runs against local, no-op
defaults.

```bash
git clone <this repo> && cd playwright-bootstrap
npx pnpm install
pnpm build

# Run the whole pipeline: a simulated CI test failure travels through
# impact analysis -> synthetic data generation -> test execution ->
# self-healing -> root-cause analysis -> one audited LLM trail.
pnpm --filter @qaf/gateway-api demo
```

You'll see real output like:

```
[Layer 2 · Orchestration]    QAAgentOrchestrator finished:
  impact.selectedTests       = []
  generatedData.validated    = true
  execution.passed           = false
  repairProposals            = 1
  rootCause.root_cause_node  = Endpoint:POST:/api/checkout
  rootCause.confidence       = 0%
[Layer 5 · Foundation]       TokenUsageStore recorded 5 call(s) for this run, across every pillar that used the gateway:
  synth-data-engine    1 call(s)
  self-healing-engine  1 call(s)
  demo-script          1 call(s)
```

That's four different engines' work landing in one execution history and one audit trail —
the thing most AI-QA demos skip.

**Next steps:**

```bash
pnpm --filter @qaf/gateway-api start        # REST API + CI/CD webhooks, :3000
pnpm --filter @qaf/gateway-api start:mcp    # MCP server over stdio, for IDE integration
docker compose up --build                   # + Postgres, Neo4j, ChromaDB for production adapters
```

Just want the underlying Playwright framework (fixtures, locator resolver, quarantine
engine) without the AI platform on top? `npm create qaf@latest my-suite` — see the root
[README](../README.md).

## How mature is this, honestly

This is a **reference architecture**, built to demonstrate the full pattern end-to-end with
every seam real and every default safe — not a hosted product.

| | Status |
|---|---|
| Compiles, typechecks, lints clean across all 13 workspace packages | ✅ verified |
| The demo above runs for real and produces the output shown | ✅ verified, every run |
| Every interface (`VectorStore`, `GraphStore`, `ExecutionStore`, `LLMGateway`, ...) has a working local/no-op implementation | ✅ verified |
| Production adapters (Qdrant, Chroma, pgvector, Neo4j, OpenAI/Anthropic/Ollama) | Written against each vendor's documented API shape, **not** run against a live instance in this repo — verify against your deployed version before trusting them in production |
| A real Playwright-backed `TestRunner` | Not included — `StubTestRunner` exercises the graph; wiring a live test runner is the integration point, not a solved problem here |
| Cost at scale, load testing, multi-tenant hardening | Not attempted — this is one team's reference shape, not a SaaS |

None of that is a hedge on the engineering — it's what "reference implementation" honestly
means, and it's why every default is local/no-op rather than something that quietly calls a
paid API the first time you run it.

## FAQ

**Is this calling GPT-4/Claude out of the box?**
No. Every provider defaults to a `Noop*`/`Local*` implementation that either throws with a
clear pointer or runs entirely in-memory. You wire a real model by constructing an
`@qaf/llm-gateway` provider (OpenAI-compatible, Anthropic, or your own) — see
`buildEnginesWithGateway()` in `apps/gateway-api/src/config.ts`.

**What does it cost to run?**
Nothing by default. Once you wire a real LLM provider, you pay for exactly the calls you
make — and `TokenAuditLogger` records every one of them with an estimated cost, so "how much
did this cost this run" is a query, not a guess.

**Is my data safe?**
`PiiRedactionMiddleware`/`EmbeddingPiiRedactionMiddleware` strip emails/phones/SSNs/credit
cards/IPs before anything leaves the process, and every storage default is local-first
(JSONL on disk, in-memory graph) until you explicitly point it at Postgres/Neo4j/a vector DB.
Read [ai-platform.md](ai-platform.md)'s Layer 5 section for exactly what's redacted and when.

**Does this replace Playwright or my existing framework?**
No — it's additive on top of `@qaf/core`'s Playwright fixtures/locator-resolver/quarantine
engine, which you can also use standalone via `create-qaf` with none of the AI platform.

**Can I use just one pillar?**
Yes. Every engine package (`@qaf/rag-core`, `@qaf/graph-rag`, `@qaf/synth-data`,
`@qaf/core`'s locator-resolver) is independently importable and was designed opt-in before
the platform layer existed on top of them.

**What's the license?**
MIT, per each package's `package.json`.

## What's next

- A real Playwright-backed `TestRunner` (currently the one deliberately unfinished seam).
- Wiring `vectorHealingProvider`/`gitAutoPrProvider` through the same gateway pattern the
  three LLM-calling providers already use.
- Finer-grained `requestedBy` attribution for embedding calls (currently RAG and GraphRAG
  share one embedding provider instance, so their calls land unattributed in the audit
  trail).
- A hosted reference deployment.

Found a gap, have a use case this doesn't cover, or want to contribute one of the above? See
[contributing.md](contributing.md).

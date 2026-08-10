# playwright-bootstrap

A QA automation framework bootstrap for Playwright + TypeScript, built so QA teams start
new suites from a versioned, updatable dependency — not a git fork that diverges the moment
anyone touches it. It also ships an **AI-Driven QA Platform** on top: RAG coverage/triage,
GraphRAG impact & root-cause analysis, governed synthetic data, and self-healing locators,
all behind one orchestrator and one audited LLM boundary — advanced System Integration
Testing, not just UI test automation.

**New here?** → **[docs/getting-started.md](docs/getting-started.md)** — the problem this
solves, the benefits, a 5-minute quickstart with real output, and an honest maturity/FAQ
section. Everything below this point assumes you're already contributing to or adopting the
framework itself.

## What's in here

- **`@qaf/core`** — fixtures (logger, data isolation, locator resolver with an opt-in
  AI-repair hook, auth, API client), `BasePage`/`BaseComponent`, a quarantine engine with an
  anti-graveyard ceiling, visual/a11y helpers.
- **`@qaf/eslint-plugin-qaf`** — enforces the framework's two hard rules: every locator goes
  through the resolver (`data-testid` first), and `console.*` is banned in favor of the
  `logger` fixture.
- **`create-qaf`** — `npm create qaf@latest my-suite` scaffolds a new repo wired to
  published versions of the above, with an example web/API/mobile suite, sharded CI,
  visual/a11y workflows, quarantine automation, and a 5-skill Claude Code pipeline
  (requirements analysis -> test generation -> PR review -> quarantine triage -> health audit).
- **`template/`** — the canonical scaffold `create-qaf` copies. This is the actual
  deliverable QA teams see — read `template/docs/architecture.md` for a tour of what they get.
- **The AI-Driven QA Platform** (`apps/orchestrator`, `apps/gateway-api`,
  `@qaf/engine-contracts`, `@qaf/storage-core`, `@qaf/llm-gateway`) — a 5-layer service built
  on top of the four packages above: an MCP server + REST API + CI/CD webhooks (Layer 1) front
  a LangGraph.js orchestrator (Layer 2) that routes one CI failure across the four pillars
  (Layer 3) with pluggable production storage (Layer 4) and a unified LLM gateway with token
  audit + PII redaction (Layer 5). See [docs/ai-platform.md](docs/ai-platform.md).

## Getting started (as a framework contributor)

```bash
npx pnpm install
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

See [docs/contributing.md](docs/contributing.md).

## Getting started (as a QA team adopting the framework)

```bash
npm create qaf@latest my-qa-suite
cd my-qa-suite
pnpm test
```

See `template/README.md` (what ends up in your generated repo) and
`template/docs/architecture.md`.

## Running the AI-Driven QA Platform

```bash
npx pnpm install && pnpm build

pnpm --filter @qaf/gateway-api start       # REST API + CI/CD webhooks on :3000
pnpm --filter @qaf/gateway-api start:mcp   # MCP server over stdio, for IDE integration
pnpm --filter @qaf/gateway-api demo        # a CI failure payload traveling Layer 1 -> Layer 5

docker compose up --build                  # + Postgres, Neo4j, ChromaDB for the production adapters
```

See [docs/ai-platform.md](docs/ai-platform.md) for the full layer-by-layer breakdown.

## Docs

- [docs/architecture.md](docs/architecture.md) — this monorepo's package layout
- [docs/ai-platform.md](docs/ai-platform.md) — the 5-layer AI-Driven QA Platform
- [docs/contributing.md](docs/contributing.md) — adding a fixture/rule, editing the template
- [docs/changesets.md](docs/changesets.md) — the release flow
- `template/docs/*` — everything a QA team needs day-to-day (conventions, anti-patterns,
  data isolation, the locator resolver, quarantine, CI sharding, visual testing, the Claude
  skills pipeline)

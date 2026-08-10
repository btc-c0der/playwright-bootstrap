# RAG semantic coverage

Optional, opt-in: semantic spec-to-test mapping and CI failure root-cause clustering, backed by
[`@qaf/rag-core`](https://www.npmjs.com/package/@qaf/rag-core). Unlike the fixtures/quarantine
engine/locator resolver, this isn't installed by default — add it when you want it:

```bash
pnpm add -D @qaf/rag-core
```

## What it gives you

1. **Spec-to-test mapping** — embeds this repo's own docs (and, optionally, your Jira issues /
   Confluence pages / Zephyr test cases) alongside your test suite, then reports which specs
   have no matching test (gaps) and which tests trace to no live spec (orphans).
2. **CI root-cause clustering** — when a test fails in CI, tells you whether this exact failure
   signature has been seen before and what the root cause was last time, instead of starting
   triage from zero.

Both are **advisory only**. Nothing here fails CI, deletes a test, or closes a ticket — treat
every report row as a hint to review, the same way you'd treat an AI-repair locator suggestion.

## Setup

1. `pnpm add -D @qaf/rag-core`.
2. Wire a real embedding backend — this framework ships no default one (no API key held that
   you didn't ask for). Write a small module:

   ```ts
   // rag-provider.ts
   import OpenAI from "openai";
   import type { EmbeddingProvider } from "@qaf/rag-core";

   const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

   export default {
     id: "openai:text-embedding-3-small",
     dimensions: 1536,
     async embed(texts) {
       const res = await client.embeddings.create({
         model: "text-embedding-3-small",
         input: texts,
       });
       return res.data.map((d) => d.embedding);
     },
   } satisfies EmbeddingProvider;
   ```

3. Add scripts to `package.json` (or run directly):

   ```json
   {
     "scripts": {
       "rag:index": "qaf-rag-index",
       "rag:map": "qaf-rag-map"
     }
   }
   ```

4. Run it: `QAF_RAG_ENABLED=true QAF_RAG_PROVIDER_MODULE=./rag-provider.ts pnpm rag:index && pnpm rag:map`.
   Writes `docs/coverage-reports/<date>.md`.

Everything is off unless `QAF_RAG_ENABLED=true` is set — safe to add the dependency and scripts
without changing CI behavior until you're ready to turn it on.

## Adding Jira / Confluence / Zephyr

Point the corresponding env var at a JSON file of already-normalized documents before running
`qaf-rag-index`:

| Env var                         | Populated by                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `QAF_RAG_JIRA_ISSUES_PATH`      | The `/rag-coverage` skill, via the Atlassian MCP tools if you have them connected in Claude Code — or your own Jira REST script |
| `QAF_RAG_CONFLUENCE_PAGES_PATH` | Same, for Confluence pages                                                                                                      |
| `QAF_RAG_ZEPHYR_CASES_PATH`     | Your own Zephyr Scale export/API script — see `@qaf/rag-core`'s `createZephyrScaleApiSource` for a ready-made Cloud API adapter |

See `/rag-coverage`'s `SKILL.md` (`.claude/skills/rag-coverage/`) for the exact flow.

## CI root-cause clustering setup

1. Register the failure reporter in `playwright.config.ts`, alongside your other reporters:

   ```ts
   reporters: [
     ["list"],
     ["@qaf/rag-core/reporter"],
     // ...
   ],
   ```

2. Add a post-test CI step (see `.github/workflows/ci.yml`):

   ```yaml
   - name: RAG root-cause clustering
     if: always()
     run: QAF_RAG_ENABLED=true QAF_RAG_PROVIDER_MODULE=./rag-provider.ts npx qaf-rag-cluster
   ```

   `if: always()` matters — clustering needs to run even when the test step failed.

Matches show up as `::warning`/`::notice` annotations directly on the PR's "Files changed" tab,
same mechanism `qaf-check-quarantine` already uses.

## Full reference

[`@qaf/rag-core`'s own docs](https://github.com/{{ORG_SCOPE}}/playwright-bootstrap/blob/main/docs/rag-coverage.md)
cover the underlying mechanism (chunking, incremental indexing, symbolization, the local vector
store, when to graduate off it) in depth.

#!/usr/bin/env node
import { indexDocuments } from "../indexing/index.js";
import { createInternalSpecsSource } from "../sources/internal-specs.js";
import { createTestCatalogSource } from "../sources/test-catalog.js";
import { createJiraSource, type JiraIssueInput } from "../sources/jira.js";
import { createConfluenceSource, type ConfluencePageInput } from "../sources/confluence.js";
import { createZephyrSourceFromTestCases, type ZephyrTestCaseInput } from "../sources/zephyr.js";
import { LocalJsonlVectorStore } from "../vector-store/local-jsonl-store.js";
import type { DocumentSource } from "../sources/types.js";
import { loadProviderFromEnv, readJsonFile } from "./load-provider.js";

/**
 * Incrementally (re-)embeds every configured source into the vector store.
 * Internal specs + the test catalog run unconditionally (zero external
 * dependencies); Jira/Confluence/Zephyr are added only if their env var
 * points at a normalized JSON file — see docs/rag-coverage.md for how the
 * `/rag-coverage` skill produces those files via the Atlassian MCP tools.
 */
async function loadExtraSources(): Promise<DocumentSource[]> {
  const sources: DocumentSource[] = [];

  const jiraPath = process.env.QAF_RAG_JIRA_ISSUES_PATH;
  if (jiraPath) {
    sources.push(createJiraSource({ loadIssues: () => readJsonFile<JiraIssueInput[]>(jiraPath) }));
  }

  const confluencePath = process.env.QAF_RAG_CONFLUENCE_PAGES_PATH;
  if (confluencePath) {
    sources.push(
      createConfluenceSource({
        loadPages: () => readJsonFile<ConfluencePageInput[]>(confluencePath),
      }),
    );
  }

  const zephyrPath = process.env.QAF_RAG_ZEPHYR_CASES_PATH;
  if (zephyrPath) {
    sources.push(
      createZephyrSourceFromTestCases(() => readJsonFile<ZephyrTestCaseInput[]>(zephyrPath)),
    );
  }

  return sources;
}

async function main(): Promise<void> {
  if (process.env.QAF_RAG_ENABLED !== "true") {
    process.stdout.write(
      'qaf-rag-index: QAF_RAG_ENABLED is not "true" — skipping. RAG indexing is opt-in, see docs/rag-coverage.md.\n',
    );
    return;
  }

  const provider = await loadProviderFromEnv();
  const store = new LocalJsonlVectorStore(process.env.QAF_RAG_INDEX_DIR ?? ".qaf/vector-index");
  const sources: DocumentSource[] = [
    createInternalSpecsSource(),
    createTestCatalogSource(),
    ...(await loadExtraSources()),
  ];

  const summaries = await indexDocuments({
    sources,
    embeddingProvider: provider,
    vectorStore: store,
  });
  for (const s of summaries) {
    process.stdout.write(
      `${s.namespace}: fetched ${s.fetched}, embedded ${s.embedded}, skipped ${s.skippedUnchanged}, deleted ${s.deleted}\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(`qaf-rag-index failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});

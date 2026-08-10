#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { ingestAll, type IngestSources } from "../ingestion/ingest.js";
import { buildConstraintRegistry } from "../registry/constraint-registry.js";
import { LocalConstraintStore } from "../registry/local-constraint-store.js";
import { loadEmbeddingProviderFromEnv, readJsonFile } from "./load-provider.js";

/**
 * Ingests every configured schema source and (re-)embeds the Constraint Rules
 * Registry — the CLI half of requirement 1. Every source is optional and
 * file-path-driven via env vars, same convention as `@qaf/rag-core`'s
 * `qaf-rag-index` (`QAF_RAG_JIRA_ISSUES_PATH` etc.): this package does no
 * database/network I/O to discover schemas itself, a consuming repo's own
 * migration/schema-dump tooling produces the files this reads.
 */
async function loadSources(): Promise<IngestSources> {
  const sources: IngestSources = {};

  const ddlPaths = process.env.QAF_SYNTH_POSTGRES_DDL_PATHS?.split(",").map((p) => p.trim()).filter(Boolean);
  if (ddlPaths?.length) {
    sources.postgresDdl = await Promise.all(ddlPaths.map((p) => readFile(p, "utf-8")));
  }

  const mongoPath = process.env.QAF_SYNTH_MONGO_SCHEMAS_PATH;
  if (mongoPath) sources.mongoCollections = await readJsonFile(mongoPath);

  const openApiPath = process.env.QAF_SYNTH_OPENAPI_DOCS_PATH;
  if (openApiPath) sources.openApiDocuments = await readJsonFile(openApiPath);

  const jsonSchemaPath = process.env.QAF_SYNTH_JSON_SCHEMAS_PATH;
  if (jsonSchemaPath) sources.jsonSchemas = await readJsonFile(jsonSchemaPath);

  return sources;
}

async function main(): Promise<void> {
  if (process.env.QAF_SYNTH_ENABLED !== "true") {
    process.stdout.write(
      'qaf-synth-ingest: QAF_SYNTH_ENABLED is not "true" — skipping. Synthetic data generation is ' +
        "opt-in, see docs/synthetic-data-engine.md.\n",
    );
    return;
  }

  const sources = await loadSources();
  const { schemas, entityCount, fieldCount, foreignKeyCount } = ingestAll(sources);
  process.stdout.write(
    `ingested ${entityCount} entities, ${fieldCount} fields, ${foreignKeyCount} foreign keys\n`,
  );

  const embeddingProvider = await loadEmbeddingProviderFromEnv();
  const vectorStore = new LocalConstraintStore(process.env.QAF_SYNTH_INDEX_DIR ?? ".qaf/synth-index");
  const summary = await buildConstraintRegistry({ schemas, embeddingProvider, vectorStore });
  process.stdout.write(
    `registry: ${summary.rules} rules, embedded ${summary.embedded}, skipped ${summary.skippedUnchanged}, deleted ${summary.deleted}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`qaf-synth-ingest failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});

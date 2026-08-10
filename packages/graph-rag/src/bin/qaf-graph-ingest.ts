#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { LocalGraphStore } from "../graph/local-graph-store.js";
import { ingestAll } from "../ingestion/ingest.js";
import type { IngestSources } from "../ingestion/ingest.js";
import type { OpenApiDocument } from "../ingestion/openapi.js";
import type { AsyncApiDocument } from "../ingestion/asyncapi.js";

interface OpenApiSourceConfig {
  serviceName: string;
  /** Path to an already-JSON-parsed OpenAPI document — this package adds no YAML dependency, see docs/graph-rag.md. */
  documentPath: string;
  sourceFile?: string;
}

interface AsyncApiSourceConfig {
  serviceName: string;
  documentPath: string;
  sourceFile?: string;
}

interface SourcesConfig {
  openapi?: OpenApiSourceConfig[];
  asyncapi?: AsyncApiSourceConfig[];
  /** Explicit spec file paths, not a glob — this package adds no glob-matching dependency; produce the list with your own `find`/glob tool in CI. */
  testCatalogFiles?: string[];
}

/**
 * Reads a `SourcesConfig` JSON file (`QAF_GRAPH_SOURCES_PATH`, default
 * `qaf-graph-sources.json`) naming contract documents + spec files, ingests
 * all of them into a fresh (or existing, for incremental runs)
 * `LocalGraphStore`, and persists the result. Swap `LocalGraphStore` for
 * `Neo4jCompatibleGraphStore` by writing your own thin wrapper around this
 * bin's logic — nothing else in this package assumes the local backend.
 */
async function main(): Promise<void> {
  const sourcesPath = process.env.QAF_GRAPH_SOURCES_PATH ?? "qaf-graph-sources.json";
  const config = await readJson<SourcesConfig>(sourcesPath);

  const sources: IngestSources = {};
  if (config.openapi) {
    sources.openapi = await Promise.all(
      config.openapi.map(async (c) => ({
        serviceName: c.serviceName,
        document: await readJson<OpenApiDocument>(c.documentPath),
        sourceFile: c.sourceFile,
      })),
    );
  }
  if (config.asyncapi) {
    sources.asyncapi = await Promise.all(
      config.asyncapi.map(async (c) => ({
        serviceName: c.serviceName,
        document: await readJson<AsyncApiDocument>(c.documentPath),
        sourceFile: c.sourceFile,
      })),
    );
  }
  if (config.testCatalogFiles) {
    sources.testCatalog = { files: config.testCatalogFiles };
  }

  const store = new LocalGraphStore(process.env.QAF_GRAPH_INDEX_DIR ?? ".qaf/graph-index");
  await store.load();
  const summary = await ingestAll(sources, store);
  await store.save();

  process.stdout.write(
    `qaf-graph-ingest: wrote ${summary.nodesWritten} nodes, ${summary.edgesWritten} edges` +
      (summary.inferredNodeIds.length > 0
        ? ` (${summary.inferredNodeIds.length} inferred placeholder node(s): ${summary.inferredNodeIds.join(", ")} — no contract declared these; ingest their source too for full topology)`
        : "") +
      ".\n",
  );
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

main().catch((error) => {
  process.stderr.write(`qaf-graph-ingest failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});

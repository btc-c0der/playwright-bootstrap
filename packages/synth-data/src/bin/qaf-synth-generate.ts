#!/usr/bin/env node
import { generateSyntheticPayload } from "../generation/generate.js";
import { reconstructEntitySchemas } from "../registry/constraint-registry.js";
import { LocalConstraintStore } from "../registry/local-constraint-store.js";
import { createIsolationContext } from "../isolation/isolation-key.js";
import { loadEmbeddingProviderFromEnv, loadLlmProviderFromEnv } from "./load-provider.js";

/**
 * One-shot CLI: `qaf-synth-generate <primaryEntity> <natural language request...>`.
 * Reads entity schemas back out of the registry `qaf-synth-ingest` already
 * populated (`reconstructEntitySchemas`) rather than re-parsing source files,
 * so this only needs `QAF_SYNTH_INDEX_DIR` to point at the same directory
 * ingestion wrote to. Prints the `GenerationResult` JSON to stdout — pipe it
 * into `jq`, a fixture, or a seed step.
 */
async function main(): Promise<void> {
  const [primaryEntity, ...requestParts] = process.argv.slice(2);
  if (!primaryEntity || requestParts.length === 0) {
    process.stderr.write("usage: qaf-synth-generate <primaryEntity> <natural language request...>\n");
    process.exitCode = 1;
    return;
  }

  const vectorStore = new LocalConstraintStore(process.env.QAF_SYNTH_INDEX_DIR ?? ".qaf/synth-index");
  const entitySchemas = reconstructEntitySchemas(await vectorStore.all());
  const embeddingProvider = await loadEmbeddingProviderFromEnv();
  const llmProvider = await loadLlmProviderFromEnv();
  const isolation = createIsolationContext({
    workerId: process.env.QAF_SYNTH_WORKER_ID ?? "cli",
    runId: process.env.QAF_SYNTH_RUN_ID,
  });

  const result = await generateSyntheticPayload({
    request: requestParts.join(" "),
    primaryEntity,
    entitySchemas,
    llmProvider,
    embeddingProvider,
    constraintStore: vectorStore,
    isolationKey: isolation.isolationKey,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.validation_status) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`qaf-synth-generate failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});

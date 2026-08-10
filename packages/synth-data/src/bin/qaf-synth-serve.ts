#!/usr/bin/env node
import { createSynthDataServer } from "../api/server.js";
import { reconstructEntitySchemas } from "../registry/constraint-registry.js";
import { LocalConstraintStore } from "../registry/local-constraint-store.js";
import { loadEmbeddingProviderFromEnv, loadLlmProviderFromEnv, loadSeedTargetFromEnv } from "./load-provider.js";

/**
 * Starts the REST API (requirement 2's "Expose a generation interface") on
 * `QAF_SYNTH_PORT` (default 4600). Reads entity schemas from the registry, not
 * from source files — run `qaf-synth-ingest` first (or after any schema
 * change) so this always serves against what's actually indexed.
 */
async function main(): Promise<void> {
  const vectorStore = new LocalConstraintStore(process.env.QAF_SYNTH_INDEX_DIR ?? ".qaf/synth-index");
  const entitySchemas = reconstructEntitySchemas(await vectorStore.all());
  if (entitySchemas.length === 0) {
    process.stdout.write(
      "qaf-synth-serve: the Constraint Rules Registry is empty — run qaf-synth-ingest first.\n",
    );
  }

  const server = createSynthDataServer({
    entitySchemas,
    llmProvider: await loadLlmProviderFromEnv(),
    embeddingProvider: await loadEmbeddingProviderFromEnv(),
    constraintStore: vectorStore,
    seedTarget: await loadSeedTargetFromEnv(),
  });

  const port = Number(process.env.QAF_SYNTH_PORT ?? 4600);
  server.listen(port, () => {
    process.stdout.write(`qaf-synth-serve: listening on http://localhost:${port}\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`qaf-synth-serve failed: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});

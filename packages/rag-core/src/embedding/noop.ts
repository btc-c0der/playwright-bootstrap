import type { EmbeddingProvider } from "./types.js";

/**
 * Default provider — RAG indexing is opt-in, and unlike `NoopAiRepairProvider`
 * (which can legitimately return "no suggestion"), an embedding call has no
 * meaningful empty result: a zero-vector would silently corrupt every
 * similarity score derived from it. So the noop throws instead of returning
 * garbage — `QAF_RAG_ENABLED` gates callers (see bin/*) so this is only ever
 * reached if something tries to index without a real provider configured.
 */
export class NoopEmbeddingProvider implements EmbeddingProvider {
  readonly id = "noop";
  readonly dimensions = 0;

  async embed(): Promise<number[][]> {
    throw new Error(
      "RAG coverage indexing is opt-in and requires a real EmbeddingProvider to be configured " +
        "— see docs/rag-coverage.md for how to wire one (e.g. an OpenAI/Voyage-backed provider).",
    );
  }
}

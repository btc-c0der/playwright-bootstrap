/**
 * Pluggable, opt-in embedding backend — same shape as `@qaf/core`'s
 * `AiRepairProvider`. `@qaf/rag-core` ships only `NoopEmbeddingProvider`
 * (see noop.ts); wiring a real model (OpenAI/Voyage/Cohere/a local model) is a
 * consuming-repo choice (docs/rag-coverage.md documents an example) so no
 * indexing run is forced to hold an API key it doesn't want.
 */
export interface EmbeddingProvider {
  /**
   * Identifies the model, e.g. `"openai:text-embedding-3-small"`. Stored on
   * every `VectorRecord` produced with this provider so a model change is
   * detectable instead of silently mixing incompatible vector spaces —
   * `indexDocuments()` treats an id mismatch as "must re-embed".
   */
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

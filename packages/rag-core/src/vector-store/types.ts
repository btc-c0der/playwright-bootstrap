export type VectorNamespace =
  | "spec"
  | "test"
  | "jira"
  | "confluence"
  | "zephyr"
  | "ci-failure"
  | "locator";

export interface VectorRecord {
  /** Stable per source item, e.g. `"jira:PROJ-123"` or a test's `buildEntryId()`. */
  id: string;
  namespace: VectorNamespace;
  vector: number[];
  metadata: Record<string, unknown>;
  /** sha256 of the normalized source text — drives incremental reindex in indexing/index.ts. */
  contentHash: string;
  /** `EmbeddingProvider.id` this vector was produced with — see embedding/types.ts. */
  embeddingId: string;
  indexedAt: string;
}

export interface ScoredRecord extends VectorRecord {
  score: number;
}

export interface VectorQueryOptions {
  namespace?: VectorNamespace;
  topK: number;
  /** Drop matches below this cosine similarity (range -1..1). */
  minScore?: number;
}

/**
 * Pluggable, opt-in vector backend — same shape as `EmbeddingProvider`.
 * `@qaf/rag-core` ships only `LocalJsonlVectorStore` (dependency-free, fine at
 * single-team scale); a hosted backend (pgvector/Qdrant/Pinecone) is a
 * consuming-repo choice implementing this same interface.
 */
export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>;
  query(vector: number[], opts: VectorQueryOptions): Promise<ScoredRecord[]>;
  delete(ids: string[]): Promise<void>;
  all(namespace?: VectorNamespace): Promise<VectorRecord[]>;
}

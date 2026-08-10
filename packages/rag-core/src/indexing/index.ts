import type { EmbeddingProvider } from "../embedding/types.js";
import type { DocumentSource } from "../sources/types.js";
import type { VectorNamespace, VectorRecord, VectorStore } from "../vector-store/types.js";
import { chunkDocument, type Chunk, type ChunkOptions } from "./chunk.js";

export interface IndexSummary {
  namespace: VectorNamespace;
  /** Source documents fetched this run, before chunking. */
  fetched: number;
  /** Chunks newly embedded (new or content-changed since the last run). */
  embedded: number;
  /** Chunks whose content hash was unchanged — no embedding call made for these. */
  skippedUnchanged: number;
  /** Previously-indexed records whose source no longer produced them. */
  deleted: number;
}

export interface IndexOptions {
  sources: DocumentSource[];
  embeddingProvider: EmbeddingProvider;
  vectorStore: VectorStore;
  chunkOptions?: ChunkOptions;
  /** Texts per `embed()` call — keeps a single call within a provider's request-size limits. */
  batchSize?: number;
}

/**
 * Runs each source's `fetch()`, chunks the result, and reconciles it against
 * whatever is already in the `VectorStore` for that namespace:
 *   - unchanged content (same id + contentHash + embeddingId) is left alone —
 *     no embedding call, keeping cost proportional to *changed* docs, not
 *     total corpus size (see docs/rag-coverage-plan.md)
 *   - new/changed chunks get embedded (batched) and upserted
 *   - previously-indexed ids the source no longer produces get deleted
 * Namespaces are handled independently and in source order — one source's
 * failure doesn't roll back another's, matching this codebase's general
 * preference for partial progress over all-or-nothing batch jobs.
 */
export async function indexDocuments(options: IndexOptions): Promise<IndexSummary[]> {
  const batchSize = options.batchSize ?? 100;
  const summaries: IndexSummary[] = [];

  for (const source of options.sources) {
    const docs = await source.fetch();
    const chunks = docs.flatMap((doc) => chunkDocument(doc, options.chunkOptions));
    const currentIds = new Set(chunks.map((c) => c.id));

    const existing = await options.vectorStore.all(source.namespace);
    const existingById = new Map(existing.map((r) => [r.id, r]));

    const toEmbed = chunks.filter(
      (chunk) => !isUpToDate(chunk, existingById.get(chunk.id), options.embeddingProvider.id),
    );

    const embedded = await embedAndUpsert(
      toEmbed,
      options.embeddingProvider,
      options.vectorStore,
      batchSize,
    );

    const removedIds = existing.map((r) => r.id).filter((id) => !currentIds.has(id));
    if (removedIds.length > 0) {
      await options.vectorStore.delete(removedIds);
    }

    summaries.push({
      namespace: source.namespace,
      fetched: docs.length,
      embedded,
      skippedUnchanged: chunks.length - toEmbed.length,
      deleted: removedIds.length,
    });
  }

  return summaries;
}

function isUpToDate(chunk: Chunk, prior: VectorRecord | undefined, embeddingId: string): boolean {
  return (
    prior !== undefined &&
    prior.contentHash === chunk.contentHash &&
    prior.embeddingId === embeddingId
  );
}

async function embedAndUpsert(
  chunks: Chunk[],
  provider: EmbeddingProvider,
  store: VectorStore,
  batchSize: number,
): Promise<number> {
  const now = new Date().toISOString();
  let embedded = 0;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const vectors = await provider.embed(batch.map((c) => c.text));
    if (vectors.length !== batch.length) {
      throw new Error(
        `EmbeddingProvider "${provider.id}" returned ${vectors.length} vectors for ${batch.length} texts`,
      );
    }
    const records: VectorRecord[] = batch.map((chunk, idx) => ({
      id: chunk.id,
      namespace: chunk.namespace,
      // Non-null: the length check above guarantees every index up to batch.length - 1 exists.
      vector: vectors[idx] as number[],
      metadata: chunk.metadata,
      contentHash: chunk.contentHash,
      embeddingId: provider.id,
      indexedAt: now,
    }));
    await store.upsert(records);
    embedded += records.length;
  }
  return embedded;
}

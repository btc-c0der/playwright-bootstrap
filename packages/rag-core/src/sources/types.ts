import type { VectorNamespace } from "../vector-store/types.js";

/**
 * A raw unit fetched from one source system, before chunking. One
 * `SourceDocument` per file/ticket/page/test — `indexing/chunk.ts` is what
 * splits large ones (e.g. a long spec doc) into embeddable pieces.
 */
export interface SourceDocument {
  /** Stable id within this source, e.g. `"jira:PROJ-123"`, `"confluence:98765"`, a test's `buildEntryId()`. */
  id: string;
  namespace: VectorNamespace;
  title: string;
  text: string;
  /** Deep link back to the source system, when one exists (Jira/Confluence issue/page URL). */
  url?: string;
  /** ISO timestamp of last edit at the source, when known — surfaced in reports so stale matches are visible. */
  updatedAt?: string;
  metadata: Record<string, unknown>;
}

/**
 * A source of documents to index. `fetch()` returns the *current* full set —
 * `indexing/index.ts` diffs against what's already indexed (by content hash)
 * to decide what actually needs re-embedding, and reconciles deletions.
 */
export interface DocumentSource {
  namespace: VectorNamespace;
  fetch(): Promise<SourceDocument[]>;
}

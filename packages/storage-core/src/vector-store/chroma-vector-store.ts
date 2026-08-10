import type { ScoredRecord, VectorNamespace, VectorQueryOptions, VectorRecord, VectorStore } from "@qaf/rag-core";

export interface ChromaVectorStoreOptions {
  /** e.g. `"http://localhost:8000"`. */
  baseUrl: string;
  /** All namespaces share this one collection (namespace becomes a filterable metadata field). */
  collectionName?: string;
}

const DEFAULT_COLLECTION = "qaf_vectors";

interface ChromaGetResult {
  ids: string[];
  embeddings?: (number[] | null)[];
  metadatas?: (Record<string, unknown> | null)[];
}
interface ChromaQueryResult {
  ids: string[][];
  distances?: (number | null)[][];
  embeddings?: (number[] | null)[][];
  metadatas?: (Record<string, unknown> | null)[][];
}

/**
 * Production `VectorStore` against Chroma's HTTP API — plain `fetch`, no
 * `chromadb` client dependency, same "dependency-free default" posture as
 * `@qaf/rag-core`'s own `LocalJsonlVectorStore`. Targets the `/api/v1`
 * surface (`collections`, `.../add`, `.../query`, `.../delete`, `.../get`)
 * shipped by the default `chromadb/chroma` Docker image at the time this was
 * written — Chroma's HTTP API has changed across major versions (v1 vs the
 * newer tenant/database-scoped v2 paths), so confirm your deployed image's
 * API version before relying on this in production; only `request()`'s base
 * path needs to change if it has moved.
 */
export class ChromaVectorStore implements VectorStore {
  private readonly collectionName: string;
  private collectionId?: string;

  constructor(private readonly options: ChromaVectorStoreOptions) {
    this.collectionName = options.collectionName ?? DEFAULT_COLLECTION;
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    const collectionId = await this.ensureCollection();
    await this.request("POST", `/api/v1/collections/${collectionId}/add`, {
      ids: records.map((r) => r.id),
      embeddings: records.map((r) => r.vector),
      metadatas: records.map((r) => ({
        ...r.metadata,
        __qafNamespace: r.namespace,
        contentHash: r.contentHash,
        embeddingId: r.embeddingId,
        indexedAt: r.indexedAt,
      })),
    });
  }

  async query(vector: number[], opts: VectorQueryOptions): Promise<ScoredRecord[]> {
    const collectionId = await this.tryGetCollectionId();
    if (!collectionId) return [];

    const body: Record<string, unknown> = {
      query_embeddings: [vector],
      n_results: opts.topK,
      include: ["embeddings", "metadatas", "distances"],
    };
    if (opts.namespace) body.where = { __qafNamespace: opts.namespace };

    const result = await this.request<ChromaQueryResult>("POST", `/api/v1/collections/${collectionId}/query`, body);
    const ids = result.ids[0] ?? [];
    const records = ids.map((id, i) =>
      toScoredRecord(
        id,
        result.embeddings?.[0]?.[i] ?? [],
        result.metadatas?.[0]?.[i] ?? {},
        distanceToScore(result.distances?.[0]?.[i] ?? null),
      ),
    );
    return opts.minScore === undefined ? records : records.filter((r) => r.score >= opts.minScore!);
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const collectionId = await this.tryGetCollectionId();
    if (!collectionId) return;
    await this.request("POST", `/api/v1/collections/${collectionId}/delete`, { ids });
  }

  async all(namespace?: VectorNamespace): Promise<VectorRecord[]> {
    const collectionId = await this.tryGetCollectionId();
    if (!collectionId) return [];

    const body: Record<string, unknown> = { include: ["embeddings", "metadatas"] };
    if (namespace) body.where = { __qafNamespace: namespace };

    const result = await this.request<ChromaGetResult>("POST", `/api/v1/collections/${collectionId}/get`, body);
    return result.ids.map((id, i) => toVectorRecord(id, result.embeddings?.[i] ?? [], result.metadatas?.[i] ?? {}));
  }

  private async ensureCollection(): Promise<string> {
    const existing = await this.tryGetCollectionId();
    if (existing) return existing;
    const created = await this.request<{ id: string }>("POST", "/api/v1/collections", {
      name: this.collectionName,
      get_or_create: true,
    });
    this.collectionId = created.id;
    return created.id;
  }

  private async tryGetCollectionId(): Promise<string | undefined> {
    if (this.collectionId) return this.collectionId;
    const res = await fetch(`${this.options.baseUrl}/api/v1/collections/${this.collectionName}`);
    if (!res.ok) return undefined;
    const body = (await res.json()) as { id: string };
    this.collectionId = body.id;
    return body.id;
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Chroma ${method} ${path} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }
}

/** Chroma's default space is squared-L2 by collection config; this adapter treats returned `distances` as cosine distance (`1 - similarity`) — confirm your collection was created with `hnsw:space: "cosine"` for `score` to mean what `ScoredRecord` elsewhere in this monorepo means. */
function distanceToScore(distance: number | null): number {
  return distance === null ? 0 : 1 - distance;
}

function toVectorRecord(id: string, vector: number[] | null, metadata: Record<string, unknown> | null): VectorRecord {
  const { __qafNamespace, contentHash, embeddingId, indexedAt, ...rest } = metadata ?? {};
  return {
    id,
    namespace: __qafNamespace as VectorNamespace,
    vector: vector ?? [],
    metadata: rest,
    contentHash: (contentHash as string) ?? "",
    embeddingId: (embeddingId as string) ?? "",
    indexedAt: (indexedAt as string) ?? "",
  };
}

function toScoredRecord(
  id: string,
  vector: number[] | null,
  metadata: Record<string, unknown> | null,
  score: number,
): ScoredRecord {
  return { ...toVectorRecord(id, vector, metadata), score };
}

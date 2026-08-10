import type { ScoredRecord, VectorNamespace, VectorQueryOptions, VectorRecord, VectorStore } from "@qaf/rag-core";
import { deterministicUuid } from "../internal/deterministic-id.js";

export interface QdrantVectorStoreOptions {
  /** e.g. `"http://localhost:6333"`. */
  baseUrl: string;
  apiKey?: string;
  /** All namespaces share this one collection (namespace becomes a filterable payload field) — avoids this adapter needing to create/manage a collection per namespace. */
  collection?: string;
}

const DEFAULT_COLLECTION = "qaf_vectors";

interface QdrantPoint {
  id: string;
  vector?: number[];
  payload?: Record<string, unknown>;
}
interface QdrantScoredPoint extends QdrantPoint {
  score: number;
}

/**
 * Production `VectorStore` against Qdrant's REST API — plain `fetch`, no
 * `@qdrant/js-client-rest` dependency, same "dependency-free default"
 * posture as `@qaf/rag-core`'s own `LocalJsonlVectorStore`. The collection is
 * created lazily on first `upsert()`, sized to whichever vector arrives
 * first. Verify these endpoint shapes against your deployed Qdrant version
 * before relying on this in production — REST APIs move; this targets the
 * long-stable `/collections/{name}/points` {upsert,search,delete,scroll}
 * surface.
 */
export class QdrantVectorStore implements VectorStore {
  private readonly collection: string;
  private ensured = false;

  constructor(private readonly options: QdrantVectorStoreOptions) {
    this.collection = options.collection ?? DEFAULT_COLLECTION;
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.ensureCollection(records[0]!.vector.length);
    await this.request("PUT", `/collections/${this.collection}/points`, {
      points: records.map((r) => ({
        id: deterministicUuid(r.id),
        vector: r.vector,
        payload: {
          ...r.metadata,
          __qafId: r.id,
          __qafNamespace: r.namespace,
          contentHash: r.contentHash,
          embeddingId: r.embeddingId,
          indexedAt: r.indexedAt,
        },
      })),
    });
  }

  async query(vector: number[], opts: VectorQueryOptions): Promise<ScoredRecord[]> {
    if (!(await this.exists())) return [];
    const body: Record<string, unknown> = { vector, limit: opts.topK, with_payload: true, with_vector: true };
    if (opts.minScore !== undefined) body.score_threshold = opts.minScore;
    if (opts.namespace) body.filter = { must: [{ key: "__qafNamespace", match: { value: opts.namespace } }] };

    const result = await this.request<{ result: QdrantScoredPoint[] }>(
      "POST",
      `/collections/${this.collection}/points/search`,
      body,
    );
    return result.result.map(toScoredRecord);
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.request("POST", `/collections/${this.collection}/points/delete`, {
      points: ids.map(deterministicUuid),
    });
  }

  async all(namespace?: VectorNamespace): Promise<VectorRecord[]> {
    if (!(await this.exists())) return [];
    const body: Record<string, unknown> = { limit: 10_000, with_payload: true, with_vector: true };
    if (namespace) body.filter = { must: [{ key: "__qafNamespace", match: { value: namespace } }] };
    const result = await this.request<{ result: { points: QdrantPoint[] } }>(
      "POST",
      `/collections/${this.collection}/points/scroll`,
      body,
    );
    return result.result.points.map(toVectorRecord);
  }

  private async ensureCollection(vectorSize: number): Promise<void> {
    if (this.ensured || (await this.exists())) {
      this.ensured = true;
      return;
    }
    await this.request("PUT", `/collections/${this.collection}`, {
      vectors: { size: vectorSize, distance: "Cosine" },
    });
    this.ensured = true;
  }

  private async exists(): Promise<boolean> {
    const res = await fetch(`${this.options.baseUrl}/collections/${this.collection}`, { headers: this.headers() });
    return res.ok;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.options.apiKey) headers["api-key"] = this.options.apiKey;
    return headers;
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Qdrant ${method} ${path} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }
}

function toVectorRecord(point: QdrantPoint): VectorRecord {
  const payload = point.payload ?? {};
  const { __qafId, __qafNamespace, contentHash, embeddingId, indexedAt, ...metadata } = payload;
  return {
    id: (__qafId as string) ?? point.id,
    namespace: __qafNamespace as VectorNamespace,
    vector: point.vector ?? [],
    metadata,
    contentHash: (contentHash as string) ?? "",
    embeddingId: (embeddingId as string) ?? "",
    indexedAt: (indexedAt as string) ?? "",
  };
}

function toScoredRecord(point: QdrantScoredPoint): ScoredRecord {
  return { ...toVectorRecord(point), score: point.score };
}

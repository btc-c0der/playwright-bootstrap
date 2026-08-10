import type { ScoredRecord, VectorNamespace, VectorQueryOptions, VectorRecord, VectorStore } from "@qaf/rag-core";
import type { SqlExecutor } from "../sql/types.js";

const DEFAULT_TABLE = "qaf_vectors";

/**
 * Production `VectorStore` against Postgres + the `pgvector` extension —
 * plain SQL over an injected `SqlExecutor` (see `sql/types.ts`), no separate
 * vector-DB server to run if you're already running Postgres for
 * `@qaf/storage-core`'s relational stores. Expects a table matching this
 * package's `schema.sql`. Cosine similarity via pgvector's `<=>` operator
 * (cosine *distance*); this store converts to `1 - distance` so `score`
 * means the same -1..1 "higher is closer" thing `ScoredRecord` means
 * everywhere else in this monorepo.
 */
export class PgVectorStore implements VectorStore {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly table: string = DEFAULT_TABLE,
  ) {}

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      await this.sql.query(
        `INSERT INTO ${this.table} (id, namespace, vector, metadata, content_hash, embedding_id, indexed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           namespace = EXCLUDED.namespace,
           vector = EXCLUDED.vector,
           metadata = EXCLUDED.metadata,
           content_hash = EXCLUDED.content_hash,
           embedding_id = EXCLUDED.embedding_id,
           indexed_at = EXCLUDED.indexed_at`,
        [
          record.id,
          record.namespace,
          toVectorLiteral(record.vector),
          JSON.stringify(record.metadata),
          record.contentHash,
          record.embeddingId,
          record.indexedAt,
        ],
      );
    }
  }

  async query(vector: number[], opts: VectorQueryOptions): Promise<ScoredRecord[]> {
    const params: unknown[] = [toVectorLiteral(vector)];
    const clauses: string[] = [];
    if (opts.namespace) {
      params.push(opts.namespace);
      clauses.push(`namespace = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(opts.topK);

    const rows = await this.sql.query(
      `SELECT id, namespace, vector, metadata, content_hash, embedding_id, indexed_at, 1 - (vector <=> $1) AS score
       FROM ${this.table} ${where}
       ORDER BY vector <=> $1
       LIMIT $${params.length}`,
      params,
    );
    const scored = rows.map(toScoredRecord);
    const minScore = opts.minScore;
    return minScore === undefined ? scored : scored.filter((r) => r.score >= minScore);
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.sql.query(`DELETE FROM ${this.table} WHERE id = ANY($1)`, [ids]);
  }

  async all(namespace?: VectorNamespace): Promise<VectorRecord[]> {
    const params: unknown[] = [];
    const where = namespace ? "WHERE namespace = $1" : "";
    if (namespace) params.push(namespace);

    const rows = await this.sql.query(
      `SELECT id, namespace, vector, metadata, content_hash, embedding_id, indexed_at FROM ${this.table} ${where}`,
      params,
    );
    return rows.map(toVectorRecord);
  }
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

function parseVectorLiteral(value: unknown): number[] {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    return value
      .replace(/[[\]]/g, "")
      .split(",")
      .filter((part) => part.length > 0)
      .map(Number);
  }
  return [];
}

function toVectorRecord(row: Record<string, unknown>): VectorRecord {
  return {
    id: row.id as string,
    namespace: row.namespace as VectorNamespace,
    vector: parseVectorLiteral(row.vector),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    contentHash: row.content_hash as string,
    embeddingId: row.embedding_id as string,
    indexedAt: row.indexed_at as string,
  };
}

function toScoredRecord(row: Record<string, unknown>): ScoredRecord {
  return { ...toVectorRecord(row), score: Number(row.score) };
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cosineSimilarity } from "@qaf/rag-core";

/** One historical SIT/production incident, already embedded, attributed to the node that turned out to be its real root cause. */
export interface IncidentRecord {
  id: string;
  /** The node (`GraphNode.id`) this incident's root cause was ultimately attributed to — not necessarily where it first surfaced. */
  nodeId: string;
  /** Human-written summary of what the incident was and how it was fixed — what a future match's `recommended_action` quotes from. */
  summary: string;
  vector: number[];
  /** `EmbeddingProvider.id` this vector was produced with, same rationale as `@qaf/rag-core`'s `VectorRecord.embeddingId` — a model change must not silently mix vector spaces. */
  embeddingId: string;
  occurredAt: string;
}

export interface IncidentMatch extends IncidentRecord {
  score: number;
}

export interface IncidentQueryOptions {
  topK: number;
  /** Restrict the search to incidents attributed to this node — used to ask "has *this specific* upstream candidate caused something like this before?" rather than searching the whole history. */
  nodeId?: string;
  minScore?: number;
}

/**
 * Default backend for the historical-incident half of root-cause diagnosis:
 * one JSONL file (`<baseDir>/incidents.jsonl`), loaded into memory, brute-force
 * cosine similarity at query time — same shape and same tradeoffs as
 * `@qaf/rag-core`'s `LocalJsonlVectorStore`, kept as its own minimal type here
 * rather than reusing `VectorStore` directly because `VectorNamespace` is a
 * closed union that doesn't include an "incident" kind, and incident records
 * carry a `nodeId` attribution `VectorRecord.metadata` would otherwise have to
 * carry untyped. `cosineSimilarity` itself *is* reused from `@qaf/rag-core` —
 * no reason to re-implement one pure function.
 */
export class LocalIncidentStore {
  private readonly filePath: string;
  private cache: IncidentRecord[] | undefined;

  constructor(baseDir = ".qaf/graph-index") {
    this.filePath = path.join(baseDir, "incidents.jsonl");
  }

  async upsert(records: IncidentRecord[]): Promise<void> {
    const existing = await this.load();
    const byId = new Map(existing.map((r) => [r.id, r]));
    for (const record of records) byId.set(record.id, record);
    await this.save([...byId.values()]);
  }

  async all(): Promise<IncidentRecord[]> {
    return this.load();
  }

  async query(vector: number[], options: IncidentQueryOptions): Promise<IncidentMatch[]> {
    const records = await this.load();
    const scored: IncidentMatch[] = [];
    for (const record of records) {
      if (options.nodeId && record.nodeId !== options.nodeId) continue;
      const score = cosineSimilarity(vector, record.vector);
      if (options.minScore !== undefined && score < options.minScore) continue;
      scored.push({ ...record, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, options.topK);
  }

  private async load(): Promise<IncidentRecord[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath, "utf-8");
      this.cache = raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as IncidentRecord);
      return this.cache;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.cache = [];
        return this.cache;
      }
      throw error;
    }
  }

  private async save(records: IncidentRecord[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const body = records.map((r) => JSON.stringify(r)).join("\n");
    await writeFile(this.filePath, body.length > 0 ? body + "\n" : "", "utf-8");
    this.cache = records;
  }
}

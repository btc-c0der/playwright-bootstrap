import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cosineSimilarity } from "@qaf/rag-core";
import type {
  ConstraintQueryOptions,
  ConstraintVectorRecord,
  ConstraintVectorStore,
  ScoredConstraintRecord,
} from "./types.js";

/**
 * Default `ConstraintVectorStore` backend: one JSONL file (`<baseDir>/constraints.jsonl`),
 * loaded fully into memory, brute-force cosine similarity at query time — same
 * shape and tradeoffs as `@qaf/rag-core`'s `LocalJsonlVectorStore` and
 * `@qaf/graph-rag`'s `LocalIncidentStore`. A schema's constraint set (fields +
 * FKs + business rules across every ingested entity) is small enough — tens to
 * low thousands of rules — that a single un-partitioned file is simpler than
 * per-namespace sharding without costing anything at query time.
 */
export class LocalConstraintStore implements ConstraintVectorStore {
  private readonly filePath: string;
  private cache: ConstraintVectorRecord[] | undefined;

  constructor(baseDir = ".qaf/synth-index") {
    this.filePath = path.join(baseDir, "constraints.jsonl");
  }

  async upsert(records: ConstraintVectorRecord[]): Promise<void> {
    const existing = await this.load();
    const byId = new Map(existing.map((r) => [r.id, r]));
    for (const record of records) byId.set(record.id, record);
    await this.save([...byId.values()]);
  }

  async query(vector: number[], opts: ConstraintQueryOptions): Promise<ScoredConstraintRecord[]> {
    const records = await this.load();
    const scored: ScoredConstraintRecord[] = [];
    for (const record of records) {
      if (opts.entityName && record.entityName !== opts.entityName) continue;
      const score = cosineSimilarity(vector, record.vector);
      if (opts.minScore !== undefined && score < opts.minScore) continue;
      scored.push({ ...record, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, opts.topK);
  }

  async delete(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const existing = await this.load();
    const filtered = existing.filter((r) => !idSet.has(r.id));
    if (filtered.length !== existing.length) await this.save(filtered);
  }

  async all(entityName?: string): Promise<ConstraintVectorRecord[]> {
    const records = await this.load();
    return entityName ? records.filter((r) => r.entityName === entityName) : records;
  }

  private async load(): Promise<ConstraintVectorRecord[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath, "utf-8");
      this.cache = raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as ConstraintVectorRecord);
      return this.cache;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.cache = [];
        return this.cache;
      }
      throw error;
    }
  }

  private async save(records: ConstraintVectorRecord[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const body = records.map((r) => JSON.stringify(r)).join("\n");
    await writeFile(this.filePath, body.length > 0 ? body + "\n" : "", "utf-8");
    this.cache = records;
  }
}

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ScoredRecord,
  VectorNamespace,
  VectorQueryOptions,
  VectorRecord,
  VectorStore,
} from "./types.js";
import { cosineSimilarity } from "./similarity.js";

/**
 * Default `VectorStore` backend: one JSONL file per namespace under a base
 * directory (`.qaf/vector-index/<namespace>.jsonl` by convention), loaded
 * fully into memory, brute-force cosine similarity at query time. Matches
 * this framework's existing append-friendly JSONL convention
 * (`test-run-history.jsonl`, `locator-repair-suggestions.jsonl`) rather than
 * introducing a database dependency — fine at single-team scale (thousands of
 * docs/tests/failures); swap in a `VectorStore` backed by pgvector/Qdrant/
 * Pinecone once/if corpus size warrants it (see docs/rag-coverage.md).
 *
 * Each namespace's full record set is rewritten on every `upsert`/`delete`
 * (not appended) — unlike the audit trails above, vector records are mutable
 * state keyed by id, so a read-modify-write is the correct model here, and
 * the corpus sizes this store targets make that cheap.
 */
export class LocalJsonlVectorStore implements VectorStore {
  private readonly baseDir: string;
  private readonly cache = new Map<VectorNamespace, VectorRecord[]>();

  constructor(baseDir = ".qaf/vector-index") {
    this.baseDir = baseDir;
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    const byNamespace = groupByNamespace(records);
    for (const [namespace, incoming] of byNamespace) {
      const existing = await this.load(namespace);
      const byId = new Map(existing.map((r) => [r.id, r]));
      for (const record of incoming) byId.set(record.id, record);
      await this.save(namespace, [...byId.values()]);
    }
  }

  async query(vector: number[], opts: VectorQueryOptions): Promise<ScoredRecord[]> {
    const namespaces = opts.namespace ? [opts.namespace] : await this.knownNamespaces();
    const scored: ScoredRecord[] = [];
    for (const namespace of namespaces) {
      const records = await this.load(namespace);
      for (const record of records) {
        const score = cosineSimilarity(vector, record.vector);
        if (opts.minScore !== undefined && score < opts.minScore) continue;
        scored.push({ ...record, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, opts.topK);
  }

  async delete(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    for (const namespace of await this.knownNamespaces()) {
      const existing = await this.load(namespace);
      const filtered = existing.filter((r) => !idSet.has(r.id));
      if (filtered.length !== existing.length) {
        await this.save(namespace, filtered);
      }
    }
  }

  async all(namespace?: VectorNamespace): Promise<VectorRecord[]> {
    if (namespace) return this.load(namespace);
    const namespaces = await this.knownNamespaces();
    const all: VectorRecord[] = [];
    for (const ns of namespaces) all.push(...(await this.load(ns)));
    return all;
  }

  private filePath(namespace: VectorNamespace): string {
    return path.join(this.baseDir, `${namespace}.jsonl`);
  }

  private async load(namespace: VectorNamespace): Promise<VectorRecord[]> {
    const cached = this.cache.get(namespace);
    if (cached) return cached;
    try {
      const raw = await readFile(this.filePath(namespace), "utf-8");
      const records = raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as VectorRecord);
      this.cache.set(namespace, records);
      return records;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.cache.set(namespace, []);
        return [];
      }
      throw error;
    }
  }

  private async save(namespace: VectorNamespace, records: VectorRecord[]): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    const body = records.map((r) => JSON.stringify(r)).join("\n");
    await writeFile(this.filePath(namespace), body.length > 0 ? body + "\n" : "", "utf-8");
    this.cache.set(namespace, records);
  }

  /**
   * Every namespace this instance knows about: whatever it has already
   * loaded/saved in-process, unioned with whatever `<namespace>.jsonl` files
   * exist on disk from a prior process — `query()`/`all()`/`delete()` called
   * without a namespace must see previously-persisted data on a *fresh*
   * store instance, not just what this instance happened to touch itself.
   */
  private async knownNamespaces(): Promise<VectorNamespace[]> {
    const onDisk = await this.listNamespaceFiles();
    return [...new Set([...this.cache.keys(), ...onDisk])];
  }

  private async listNamespaceFiles(): Promise<VectorNamespace[]> {
    try {
      const entries = await readdir(this.baseDir);
      return entries
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => name.slice(0, -".jsonl".length) as VectorNamespace);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}

function groupByNamespace(records: VectorRecord[]): Map<VectorNamespace, VectorRecord[]> {
  const map = new Map<VectorNamespace, VectorRecord[]>();
  for (const record of records) {
    const list = map.get(record.namespace) ?? [];
    list.push(record);
    map.set(record.namespace, list);
  }
  return map;
}

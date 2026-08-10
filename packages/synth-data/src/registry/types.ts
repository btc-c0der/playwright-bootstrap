import type { FieldConstraint, ForeignKeyRef } from "../ingestion/types.js";

export type ConstraintKind = "entity-summary" | "field" | "foreign-key" | "business-rule";

/**
 * The atomic unit the Constraint Rules Registry embeds and retrieves — one per
 * field, per FK, per free-text business rule, plus one whole-entity summary,
 * derived from an `EntitySchema` by `deriveConstraintRules` (constraint-registry.ts).
 * `description` is what gets embedded; `detail` is what `generation/prompt-builder.ts`
 * and `validation/` read back to actually build the prompt / re-check the
 * generated value — retrieval only ever needs to be *approximately* right (it's
 * picking which rules are relevant), the structured `detail` is what has to be exact.
 */
export interface ConstraintRule {
  id: string;
  entityName: string;
  kind: ConstraintKind;
  description: string;
  detail: FieldConstraint | ForeignKeyRef | { rule: string } | { fieldNames: string[]; primaryKey?: string };
}

export interface ConstraintVectorRecord {
  id: string;
  entityName: string;
  kind: ConstraintKind;
  rule: ConstraintRule;
  vector: number[];
  /** sha256 of `description` — drives the same incremental-reindex diff `@qaf/rag-core`'s `indexDocuments` uses. */
  contentHash: string;
  embeddingId: string;
  indexedAt: string;
}

export interface ScoredConstraintRecord extends ConstraintVectorRecord {
  score: number;
}

export interface ConstraintQueryOptions {
  topK: number;
  minScore?: number;
  /** Restrict retrieval to one entity's rules — used once generation has already narrowed to a target entity; omitted for the initial "which entities does this request even touch" retrieval. */
  entityName?: string;
}

/**
 * Deliberately its own minimal store type rather than reusing `@qaf/rag-core`'s
 * `VectorStore` — same reasoning as `@qaf/graph-rag`'s `LocalIncidentStore`:
 * `VectorNamespace` is a closed union that doesn't (and shouldn't) know about
 * constraint rules, and a `ConstraintVectorRecord` carries an `entityName`/`kind`
 * attribution a generic `VectorRecord.metadata` bag would otherwise have to
 * carry untyped. `cosineSimilarity` itself is still reused from `@qaf/rag-core`,
 * not reimplemented — see `local-constraint-store.ts`.
 */
export interface ConstraintVectorStore {
  upsert(records: ConstraintVectorRecord[]): Promise<void>;
  query(vector: number[], opts: ConstraintQueryOptions): Promise<ScoredConstraintRecord[]>;
  delete(ids: string[]): Promise<void>;
  all(entityName?: string): Promise<ConstraintVectorRecord[]>;
}

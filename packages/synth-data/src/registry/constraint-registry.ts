import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "@qaf/rag-core";
import type { EntitySchema, FieldConstraint, ForeignKeyRef } from "../ingestion/types.js";
import { emptyEntitySchema } from "../ingestion/types.js";
import type {
  ConstraintQueryOptions,
  ConstraintRule,
  ConstraintVectorRecord,
  ConstraintVectorStore,
  ScoredConstraintRecord,
} from "./types.js";

/**
 * Turns ingested `EntitySchema`s into the flat, embeddable `ConstraintRule[]`
 * the registry actually stores: one whole-entity summary, one rule per field,
 * one per foreign key, one per free-text business rule. Splitting this finely
 * (rather than one blob of text per entity) is what lets retrieval surface
 * "accounts.state_registration_status can be SUSPENDED" for a request that
 * never says the word "enum", without also dragging in every unrelated field
 * of the same entity.
 */
export function deriveConstraintRules(schemas: EntitySchema[]): ConstraintRule[] {
  return schemas.flatMap(deriveForEntity);
}

function deriveForEntity(schema: EntitySchema): ConstraintRule[] {
  const rules: ConstraintRule[] = [
    {
      id: `${schema.name}#summary`,
      entityName: schema.name,
      kind: "entity-summary",
      description: describeEntity(schema),
      detail: { fieldNames: schema.fields.map((f) => f.name), primaryKey: schema.primaryKey },
    },
  ];

  for (const field of schema.fields) {
    rules.push({
      id: `${schema.name}#field:${field.name}`,
      entityName: schema.name,
      kind: "field",
      description: describeField(schema.name, field),
      detail: field,
    });
  }

  for (const fk of schema.foreignKeys) {
    rules.push({
      id: `${schema.name}#fk:${fk.field}`,
      entityName: schema.name,
      kind: "foreign-key",
      description: `${schema.name}.${fk.field} must reference an existing ${fk.referencesEntity}.${fk.referencesField} record.`,
      detail: fk,
    });
  }

  schema.businessRules.forEach((rule, index) => {
    rules.push({
      id: `${schema.name}#rule:${index}`,
      entityName: schema.name,
      kind: "business-rule",
      description: `${schema.name}: ${rule}`,
      detail: { rule },
    });
  });

  return rules;
}

function describeEntity(schema: EntitySchema): string {
  const fieldNames = schema.fields.map((f) => f.name).join(", ") || "(none)";
  const pk = schema.primaryKey ? ` Primary key: ${schema.primaryKey}.` : "";
  return `Entity "${schema.name}" has fields: ${fieldNames}.${pk}`;
}

function describeField(entityName: string, field: FieldConstraint): string {
  const parts = [`${entityName}.${field.name} is a${field.required ? " required" : "n optional"} ${field.type}`];
  if (field.enum) parts.push(`one of: ${field.enum.join(", ")}`);
  if (field.pattern) parts.push(`must match pattern ${field.pattern}`);
  if (field.format) parts.push(`format: ${field.format}`);
  if (field.minLength !== undefined || field.maxLength !== undefined) {
    parts.push(`length between ${field.minLength ?? 0} and ${field.maxLength ?? "unbounded"}`);
  }
  if (field.minimum !== undefined || field.maximum !== undefined) {
    parts.push(`value between ${field.minimum ?? "unbounded"} and ${field.maximum ?? "unbounded"}`);
  }
  if (field.description) parts.push(field.description);
  return parts.join("; ") + ".";
}

export interface BuildRegistryOptions {
  schemas: EntitySchema[];
  embeddingProvider: EmbeddingProvider;
  vectorStore: ConstraintVectorStore;
  /** Texts per `embed()` call — same rationale as `@qaf/rag-core`'s `indexDocuments`. */
  batchSize?: number;
}

export interface BuildRegistrySummary {
  rules: number;
  embedded: number;
  skippedUnchanged: number;
  deleted: number;
}

/**
 * Incrementally (re-)embeds the constraint rules derived from `schemas` into
 * `vectorStore`, diffing against what's already stored by (id, contentHash,
 * embeddingId) exactly like `@qaf/rag-core`'s `indexDocuments` — so re-running
 * ingestion after a schema changes only pays embedding cost for the rules that
 * actually changed, and rules whose source field/table was removed are pruned.
 */
export async function buildConstraintRegistry(options: BuildRegistryOptions): Promise<BuildRegistrySummary> {
  const batchSize = options.batchSize ?? 100;
  const rules = deriveConstraintRules(options.schemas);
  const currentIds = new Set(rules.map((r) => r.id));

  const existing = await options.vectorStore.all();
  const existingById = new Map(existing.map((r) => [r.id, r]));

  const toEmbed = rules.filter((rule) => {
    const prior = existingById.get(rule.id);
    return !(
      prior &&
      prior.contentHash === hashText(rule.description) &&
      prior.embeddingId === options.embeddingProvider.id
    );
  });

  let embedded = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < toEmbed.length; i += batchSize) {
    const batch = toEmbed.slice(i, i + batchSize);
    const vectors = await options.embeddingProvider.embed(batch.map((r) => r.description));
    if (vectors.length !== batch.length) {
      throw new Error(
        `EmbeddingProvider "${options.embeddingProvider.id}" returned ${vectors.length} vectors for ${batch.length} texts`,
      );
    }
    const records: ConstraintVectorRecord[] = batch.map((rule, idx) => ({
      id: rule.id,
      entityName: rule.entityName,
      kind: rule.kind,
      rule,
      // Non-null: the length check above guarantees every index up to batch.length - 1 exists.
      vector: vectors[idx] as number[],
      contentHash: hashText(rule.description),
      embeddingId: options.embeddingProvider.id,
      indexedAt: now,
    }));
    await options.vectorStore.upsert(records);
    embedded += records.length;
  }

  const removedIds = existing.map((r) => r.id).filter((id) => !currentIds.has(id));
  if (removedIds.length > 0) await options.vectorStore.delete(removedIds);

  return {
    rules: rules.length,
    embedded,
    skippedUnchanged: rules.length - toEmbed.length,
    deleted: removedIds.length,
  };
}

export interface RetrieveConstraintsOptions extends Omit<ConstraintQueryOptions, "topK"> {
  topK?: number;
}

const DEFAULT_TOP_K = 15;

/**
 * The RAG half of JIT generation: embeds the natural-language request itself
 * and retrieves the nearest constraint rules — across every ingested entity
 * unless `entityName` narrows it — so "a corporate account user from Santa
 * Catarina with a suspended state registration and 3 failed PIX attempts"
 * pulls back the `region`/`state_registration_status`/`failed_pix_attempts`
 * field rules (and the FK chain connecting accounts to users and pix_attempts)
 * without the caller having named a single field or table.
 */
export async function retrieveConstraints(
  request: string,
  embeddingProvider: EmbeddingProvider,
  vectorStore: ConstraintVectorStore,
  options: RetrieveConstraintsOptions = {},
): Promise<ScoredConstraintRecord[]> {
  const [vector] = await embeddingProvider.embed([request]);
  if (!vector) return [];
  return vectorStore.query(vector, { ...options, topK: options.topK ?? DEFAULT_TOP_K });
}

/**
 * Rebuilds `EntitySchema[]` from what's already sitting in the registry — the
 * exact inverse of `deriveConstraintRules`. This is what lets a fresh process
 * (`bin/qaf-synth-generate.ts`, `bin/qaf-synth-serve.ts`) call
 * `generateSyntheticPayload` without re-parsing the original DDL/OpenAPI/JSON
 * Schema files every time: the registry itself is the durable source of
 * truth once `qaf-synth-ingest` has run, since every field/FK/business-rule
 * `ConstraintRule.detail` already carries the exact structured value ingestion
 * produced.
 */
export function reconstructEntitySchemas(records: ConstraintVectorRecord[]): EntitySchema[] {
  const byEntity = new Map<string, EntitySchema>();
  const entity = (name: string): EntitySchema => {
    const existing = byEntity.get(name);
    if (existing) return existing;
    const created = emptyEntitySchema(name, "json-schema");
    byEntity.set(name, created);
    return created;
  };

  for (const record of records) {
    const schema = entity(record.entityName);
    switch (record.kind) {
      case "entity-summary": {
        const detail = record.rule.detail as { fieldNames: string[]; primaryKey?: string };
        if (detail.primaryKey) schema.primaryKey = detail.primaryKey;
        break;
      }
      case "field":
        schema.fields.push(record.rule.detail as FieldConstraint);
        break;
      case "foreign-key":
        schema.foreignKeys.push(record.rule.detail as ForeignKeyRef);
        break;
      case "business-rule":
        schema.businessRules.push((record.rule.detail as { rule: string }).rule);
        break;
    }
  }

  return [...byEntity.values()];
}

function hashText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

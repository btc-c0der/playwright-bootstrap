import type { EntitySchema, FieldConstraint, ForeignKeyRef } from "./types.js";

/** Dedupes `(field, referencesEntity, referencesField)` triples — the same FK can be declared both inline on a column and via a table-level constraint (`postgres-ddl.ts`), or the same entity ingested from two sources that each mention it. */
export function dedupeForeignKeys(foreignKeys: ForeignKeyRef[]): ForeignKeyRef[] {
  const byKey = new Map<string, ForeignKeyRef>();
  for (const fk of foreignKeys) {
    byKey.set(`${fk.field}->${fk.referencesEntity}.${fk.referencesField}`, fk);
  }
  return [...byKey.values()];
}

/**
 * Combines every `EntitySchema` ingested under the same entity `name` — a real
 * system's Postgres DDL, its OpenAPI contract, and a hand-written JSON Schema
 * routinely describe overlapping fields of the *same* entity with
 * complementary detail (DDL has the FK and NOT NULL, the OpenAPI spec has the
 * regex `pattern` a CHECK constraint didn't spell out). Later sources win only
 * where the earlier one had nothing to say (`mergeField`); nothing is silently
 * dropped, so ingesting the same source twice is idempotent.
 */
export function mergeEntitySchemas(schemas: EntitySchema[]): EntitySchema[] {
  const byName = new Map<string, EntitySchema>();
  for (const schema of schemas) {
    const existing = byName.get(schema.name);
    if (!existing) {
      byName.set(schema.name, { ...schema, fields: [...schema.fields], foreignKeys: [...schema.foreignKeys] });
      continue;
    }
    existing.primaryKey ??= schema.primaryKey;
    existing.fields = mergeFields(existing.fields, schema.fields);
    existing.foreignKeys = dedupeForeignKeys([...existing.foreignKeys, ...schema.foreignKeys]);
    existing.businessRules = [...new Set([...existing.businessRules, ...schema.businessRules])];
  }
  return [...byName.values()];
}

function mergeFields(a: FieldConstraint[], b: FieldConstraint[]): FieldConstraint[] {
  const byName = new Map(a.map((f) => [f.name, f]));
  for (const field of b) {
    const existing = byName.get(field.name);
    byName.set(field.name, existing ? mergeField(existing, field) : field);
  }
  return [...byName.values()];
}

/** Merges two constraints known for the *same* field — union of "required" (either source demanding it is enough), the tighter of any numeric bound each side declares, and whichever side already had a value for anything that can't be tightened (enum/pattern/format/description). */
function mergeField(a: FieldConstraint, b: FieldConstraint): FieldConstraint {
  return {
    name: a.name,
    type: a.type,
    required: a.required || b.required,
    nullable: a.nullable ?? b.nullable,
    enum: a.enum ?? b.enum,
    pattern: a.pattern ?? b.pattern,
    format: a.format ?? b.format,
    minLength: tighterUpperBoundFloor(a.minLength, b.minLength),
    maxLength: tighterUpperBoundCeil(a.maxLength, b.maxLength),
    minimum: tighterUpperBoundFloor(a.minimum, b.minimum),
    maximum: tighterUpperBoundCeil(a.maximum, b.maximum),
    items: a.items ?? b.items,
    description: a.description ?? b.description,
  };
}

/** For a lower bound (minLength/minimum): the stricter constraint is the *higher* of the two. */
function tighterUpperBoundFloor(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

/** For an upper bound (maxLength/maximum): the stricter constraint is the *lower* of the two. */
function tighterUpperBoundCeil(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

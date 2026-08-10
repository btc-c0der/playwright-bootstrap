import type { EntitySchema } from "../ingestion/types.js";
import { entityRecords } from "../validation/referential-integrity.js";
import type { GenerationResult } from "../generation/generate.js";
import { createSeedTarget, topoSortEntities, type EntityWriter, type SeedTarget } from "./seed-target.js";

/** Minimal query surface this adapter needs — the shape `pg`'s `Pool`/`Client` and most other Postgres drivers already satisfy, so no `pg` dependency is added to this package (same "inject your own driver" posture as `@qaf/graph-rag`'s `Neo4jCompatibleGraphStore`). */
export interface PostgresExecutor {
  query(sql: string, params: unknown[]): Promise<unknown>;
}

export function createPostgresSeedTarget(executor: PostgresExecutor): SeedTarget {
  const writer: EntityWriter = {
    async insert(entityName, record) {
      const columns = Object.keys(record);
      const sql = `INSERT INTO ${quoteIdent(entityName)} (${columns.map(quoteIdent).join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`;
      await executor.query(sql, columns.map((c) => toSqlParam(record[c])));
    },
    async delete(entityName, primaryKeyField, primaryKeyValue) {
      await executor.query(`DELETE FROM ${quoteIdent(entityName)} WHERE ${quoteIdent(primaryKeyField)} = $1`, [
        primaryKeyValue,
      ]);
    },
  };
  return createSeedTarget(writer);
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** JSON/JSONB columns get objects/arrays as-is from most drivers; anything else, a driver's own parameter binding handles. */
function toSqlParam(value: unknown): unknown {
  return value;
}

/**
 * Requirement 5's alternative `generated_data` shape — "the validated,
 * ready-to-use entity payload **or SQL insert script**" — a plain string, no
 * live connection needed at all, for a caller that wants to paste it into a
 * migration/seed file or a `psql` session rather than go through a driver.
 * Values are inlined as SQL literals (not parameterized) since there's no
 * query round-trip here to bind params against; only ever call this on a
 * payload whose `validation_status` is `true`, same guardrail as
 * `createSeedTarget`'s `seed()`.
 */
export function buildSqlInsertScript(result: GenerationResult, entitySchemas: EntitySchema[]): string {
  if (!result.validation_status) {
    throw new Error("Refusing to render SQL for a payload with validation_status: false — see result.issues.");
  }

  const schemasByName = new Map(entitySchemas.map((s) => [s.name, s]));
  const statements: string[] = [];

  for (const entityName of topoSortEntities(entitySchemas)) {
    if (!schemasByName.has(entityName)) continue;
    for (const record of entityRecords(result.generated_data, entityName)) {
      const columns = Object.keys(record);
      if (columns.length === 0) continue;
      const values = columns.map((c) => toSqlLiteral(record[c]));
      statements.push(
        `INSERT INTO ${quoteIdent(entityName)} (${columns.map(quoteIdent).join(", ")}) VALUES (${values.join(", ")});`,
      );
    }
  }

  return statements.join("\n");
}

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

import type { EntitySchema } from "../ingestion/types.js";
import { entityRecords } from "../validation/referential-integrity.js";
import type { GenerationResult } from "../generation/generate.js";
import { IsolationTeardownStack, type SeedTeardownFailure } from "./teardown.js";

export interface SeededRecord {
  entityName: string;
  primaryKeyValue: unknown;
}

/**
 * Requirement 4's "database seeders/cleanups to automatically inject the
 * generated synthetic entity tree into staging target databases and tear
 * them down post-execution" — one `seed()`/`teardown()` pair per backend,
 * scoped by `isolation_key` so a parallel CI worker's teardown can never
 * touch another worker's rows.
 */
export interface SeedTarget {
  /** Inserts every record in `result.generated_data`, honoring FK insertion order. Refuses (throws) a payload whose `validation_status` is `false` — the guardrail from requirement 3 applies at the injection boundary, not just at generation time. */
  seed(result: GenerationResult, entitySchemas: EntitySchema[]): Promise<SeededRecord[]>;
  /** Deletes everything `seed()` inserted under this isolation key, children before parents. Returns whatever individual deletes failed (never throws — an orphaned row is a health-report concern, not a reason to fail the caller). */
  teardown(isolationKey: string): Promise<SeedTeardownFailure[]>;
}

/**
 * Minimal per-record write primitive a concrete backend implements —
 * `postgres-seed-target.ts`/`mongo-seed-target.ts` are both a few lines of
 * `insert`/`delete` over an injected driver/executor, same "inject your own
 * driver" posture as `@qaf/graph-rag`'s `Neo4jCompatibleGraphStore`. Insertion
 * order, isolation-key scoping, and LIFO teardown all live once in
 * `createSeedTarget` below rather than being reimplemented per backend.
 */
export interface EntityWriter {
  insert(entityName: string, record: Record<string, unknown>): Promise<void>;
  delete(entityName: string, primaryKeyField: string, primaryKeyValue: unknown): Promise<void>;
}

/**
 * Orders entities so every FK target is inserted before its dependents —
 * standard Kahn's-algorithm topological sort, with a deliberate escape hatch
 * for cycles (a rare but real self-referential or mutually-FK'd schema):
 * rather than throwing and blocking seeding entirely, whatever's left once no
 * node is unblockable is drained in its original order. A self-reference
 * (`fk.referencesEntity === schema.name`) never blocks its own entity —
 * that's a same-table concern seed-time insertion order can't resolve anyway.
 */
export function topoSortEntities(entitySchemas: EntitySchema[]): string[] {
  const remaining = new Map(entitySchemas.map((s) => [s.name, s]));
  const ordered: string[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((schema) =>
      schema.foreignKeys.every(
        (fk) => fk.referencesEntity === schema.name || !remaining.has(fk.referencesEntity),
      ),
    );
    const batch = ready.length > 0 ? ready : [...remaining.values()];
    for (const schema of batch) {
      ordered.push(schema.name);
      remaining.delete(schema.name);
    }
  }
  return ordered;
}

/**
 * Builds a full `SeedTarget` from just an `EntityWriter`. Each `isolation_key`
 * gets its own `IsolationTeardownStack`; a record is tracked for teardown only
 * if its entity declares a `primaryKey` and the generated record actually has
 * a value for it — a record with neither can still be inserted (some junction
 * rows have no single-column PK), it just can't be individually torn down by
 * this mechanism, which is a schema-authoring gap to flag, not a reason to
 * fail the whole seed.
 */
export function createSeedTarget(writer: EntityWriter): SeedTarget {
  const stacksByIsolationKey = new Map<string, IsolationTeardownStack>();

  return {
    async seed(result, entitySchemas) {
      if (!result.validation_status) {
        throw new Error(
          "Refusing to seed a payload with validation_status: false — see result.issues for what failed. " +
            "This guardrail is what requirement 3 means by intercepting all generated payloads before injection.",
        );
      }

      const stack = stacksByIsolationKey.get(result.isolation_key) ?? new IsolationTeardownStack();
      stacksByIsolationKey.set(result.isolation_key, stack);

      const schemasByName = new Map(entitySchemas.map((s) => [s.name, s]));
      const seeded: SeededRecord[] = [];

      for (const entityName of topoSortEntities(entitySchemas)) {
        const schema = schemasByName.get(entityName);
        if (!schema) continue;

        for (const record of entityRecords(result.generated_data, entityName)) {
          await writer.insert(entityName, record);
          const primaryKeyValue = schema.primaryKey ? record[schema.primaryKey] : undefined;
          seeded.push({ entityName, primaryKeyValue });

          if (schema.primaryKey && primaryKeyValue !== undefined) {
            const pkField = schema.primaryKey;
            stack.track({
              type: entityName,
              id: String(primaryKeyValue),
              deleteFn: () => writer.delete(entityName, pkField, primaryKeyValue),
            });
          }
        }
      }

      return seeded;
    },

    async teardown(isolationKey) {
      const stack = stacksByIsolationKey.get(isolationKey);
      if (!stack) return [];
      await stack.runAll();
      stacksByIsolationKey.delete(isolationKey);
      return stack.failures;
    },
  };
}

import type { SeedTarget } from "./seed-target.js";
import { createSeedTarget, type EntityWriter } from "./seed-target.js";

/** Minimal collection-access surface — the shape `mongodb`'s `Db#collection(name)` already satisfies for `insertOne`/`deleteOne`, so this adapter adds no `mongodb` dependency (same "inject your own driver" posture as `postgres-seed-target.ts`). */
export interface MongoExecutor {
  collection(name: string): {
    insertOne(doc: Record<string, unknown>): Promise<unknown>;
    deleteOne(filter: Record<string, unknown>): Promise<unknown>;
  };
}

export function createMongoSeedTarget(executor: MongoExecutor): SeedTarget {
  const writer: EntityWriter = {
    async insert(entityName, record) {
      await executor.collection(entityName).insertOne(record);
    },
    async delete(entityName, primaryKeyField, primaryKeyValue) {
      await executor.collection(entityName).deleteOne({ [primaryKeyField]: primaryKeyValue });
    },
  };
  return createSeedTarget(writer);
}

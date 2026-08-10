import type { EntitySchema } from "./types.js";
import { parseJsonSchema, type JsonSchemaLike, type ParseJsonSchemaOptions } from "./json-schema.js";

/** The slice of a MongoDB collection validator this ingestor reads — `db.createCollection(name, { validator: { $jsonSchema } })` or `collMod`'s equivalent. */
export interface MongoCollectionValidator {
  $jsonSchema: JsonSchemaLike;
}

export interface MongoSchemaIngestInput {
  collectionName: string;
  validator: MongoCollectionValidator;
  options?: ParseJsonSchemaOptions;
}

/**
 * Mongo's `$jsonSchema` validator already speaks this package's `JsonSchemaLike`
 * shape almost verbatim (`bsonType` instead of `type`, but every other keyword —
 * `properties`/`required`/`enum`/`pattern`/`minLength`/`description` — is
 * identical), so this is a thin naming/plumbing wrapper over `parseJsonSchema`
 * rather than a second field-constraint extractor. A collection with no
 * `$jsonSchema` validator configured simply carries no structural constraints
 * for the registry to embed — nothing here re-derives shape from sample
 * documents (that would mean reading actual data, which `isolation/pii-guard.ts`
 * exists specifically to keep this pipeline from ever needing to do).
 */
export function parseMongoJsonSchema(input: MongoSchemaIngestInput): EntitySchema {
  const entity = parseJsonSchema(input.collectionName, input.validator.$jsonSchema, input.options);
  entity.sourceKind = "mongo-schema";
  return entity;
}

export function parseMongoCollections(inputs: MongoSchemaIngestInput[]): EntitySchema[] {
  return inputs.map(parseMongoJsonSchema);
}

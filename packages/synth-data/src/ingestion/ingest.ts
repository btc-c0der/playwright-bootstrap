import type { EntitySchema } from "./types.js";
import { parsePostgresDdl } from "./postgres-ddl.js";
import { parseMongoCollections, type MongoSchemaIngestInput } from "./mongo-schema.js";
import { parseOpenApiSchemas, type OpenApiSchemaIngestInput } from "./openapi.js";
import { parseJsonSchema, type JsonSchemaLike, type ParseJsonSchemaOptions } from "./json-schema.js";
import { mergeEntitySchemas } from "./merge.js";

export interface JsonSchemaIngestInput {
  name: string;
  schema: JsonSchemaLike;
  options?: ParseJsonSchemaOptions;
}

/**
 * Every source this package can ingest, all optional — a real run typically
 * wires just one or two (e.g. Postgres DDL + an OpenAPI contract for the
 * services that front it). Raw DDL is passed as text, not a file path — this
 * package does no filesystem I/O itself; `bin/qaf-synth-ingest.ts` is what
 * reads files and hands their contents here.
 */
export interface IngestSources {
  postgresDdl?: string[];
  mongoCollections?: MongoSchemaIngestInput[];
  openApiDocuments?: OpenApiSchemaIngestInput[];
  jsonSchemas?: JsonSchemaIngestInput[];
}

export interface IngestSummary {
  schemas: EntitySchema[];
  entityCount: number;
  fieldCount: number;
  foreignKeyCount: number;
}

/**
 * Runs every configured ingestor and merges the result by entity name (see
 * `merge.ts`) — the same entity showing up from two sources (a table and the
 * OpenAPI contract that fronts it) is combined, not duplicated. The merged
 * `EntitySchema[]` is what `registry/constraint-registry.ts` embeds into the
 * Constraint Rules Registry.
 */
export function ingestAll(sources: IngestSources): IngestSummary {
  const schemas = mergeEntitySchemas([
    ...(sources.postgresDdl ?? []).flatMap(parsePostgresDdl),
    ...parseMongoCollections(sources.mongoCollections ?? []),
    ...(sources.openApiDocuments ?? []).flatMap(parseOpenApiSchemas),
    ...(sources.jsonSchemas ?? []).map((input) => parseJsonSchema(input.name, input.schema, input.options)),
  ]);

  return {
    schemas,
    entityCount: schemas.length,
    fieldCount: schemas.reduce((sum, s) => sum + s.fields.length, 0),
    foreignKeyCount: schemas.reduce((sum, s) => sum + s.foreignKeys.length, 0),
  };
}

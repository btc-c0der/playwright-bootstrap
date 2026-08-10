import type { EntitySchema } from "./types.js";
import { parseJsonSchema, type JsonSchemaLike } from "./json-schema.js";

/**
 * The slice of an OpenAPI/Swagger document this ingestor reads — `components.schemas`
 * only (request/response body schemas are conventionally `$ref`s into that same map).
 * Same "shape reader, not a schema validator" posture as `@qaf/graph-rag`'s
 * `ingestion/openapi.ts`; a consuming repo parses its own YAML and passes the
 * resulting object in. An OpenAPI Schema Object is already JSON-Schema-shaped, so
 * each entry is handed straight to `parseJsonSchema` rather than a second
 * field-constraint extractor.
 */
export interface OpenApiSchemaDocument {
  components?: { schemas?: Record<string, JsonSchemaLike> };
}

export interface OpenApiSchemaIngestInput {
  document: OpenApiSchemaDocument;
  /** OpenAPI Schema Objects have no primary-key concept — supply one per entity name if known. */
  primaryKeys?: Record<string, string>;
}

/**
 * One `EntitySchema` per `components.schemas` entry. Foreign keys are read the
 * same way as `json-schema.ts` in general — the `x-qaf-references` vendor
 * extension on a property — since plain OpenAPI has no FK concept either (a
 * `$ref` to another schema means "this field has that *shape*", not "this
 * field's value identifies a row of that entity").
 */
export function parseOpenApiSchemas(input: OpenApiSchemaIngestInput): EntitySchema[] {
  const schemas = input.document.components?.schemas ?? {};
  return Object.entries(schemas).map(([name, schema]) => {
    const entity = parseJsonSchema(name, schema, { primaryKey: input.primaryKeys?.[name] });
    entity.sourceKind = "openapi";
    return entity;
  });
}

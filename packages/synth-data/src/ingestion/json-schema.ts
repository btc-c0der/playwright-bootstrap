import type { EntitySchema, FieldConstraint, FieldType, ForeignKeyRef } from "./types.js";
import { emptyEntitySchema } from "./types.js";

/**
 * The JSON Schema subset this package reads — deliberately minimal (not the
 * full JSON Schema/OpenAPI Schema Object spec) and shared by three ingestors
 * (`json-schema.ts` itself, `mongo-schema.ts`'s `$jsonSchema` validators, and
 * `openapi.ts`'s `components.schemas`) since all three describe fields the
 * same way once bsonType/OpenAPI-Schema-Object quirks are normalized (see
 * `resolveFieldType` below). `x-qaf-references` is this package's own vendor
 * extension for the one thing plain JSON Schema has no concept of at all —
 * a foreign key — same posture as `@qaf/graph-rag`'s `x-qaf-depends-on`.
 */
export interface JsonSchemaLike {
  type?: string;
  bsonType?: string;
  properties?: Record<string, JsonSchemaLike>;
  required?: string[];
  enum?: string[];
  pattern?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  items?: JsonSchemaLike;
  description?: string;
  "x-qaf-references"?: { entity: string; field: string };
}

export interface ParseJsonSchemaOptions {
  primaryKey?: string;
  businessRules?: string[];
}

export function parseJsonSchema(
  name: string,
  schema: JsonSchemaLike,
  options: ParseJsonSchemaOptions = {},
): EntitySchema {
  const entity = emptyEntitySchema(name, "json-schema");
  entity.primaryKey = options.primaryKey;
  entity.businessRules = options.businessRules ?? [];

  const required = new Set(schema.required ?? []);
  for (const [fieldName, fieldSchema] of Object.entries(schema.properties ?? {})) {
    entity.fields.push(toFieldConstraint(fieldName, fieldSchema, required.has(fieldName)));
    const ref = fieldSchema["x-qaf-references"];
    if (ref) entity.foreignKeys.push(toForeignKeyRef(fieldName, ref));
  }
  return entity;
}

function toForeignKeyRef(field: string, ref: { entity: string; field: string }): ForeignKeyRef {
  return { field, referencesEntity: ref.entity, referencesField: ref.field };
}

function toFieldConstraint(name: string, schema: JsonSchemaLike, required: boolean): FieldConstraint {
  const field: FieldConstraint = {
    name,
    // A finite `enum` is treated as its own type regardless of the underlying
    // bsonType/JSON type (a Mongo `string` enum and a Postgres `CREATE TYPE ...
    // AS ENUM` column both end up `type: "enum"` — see `postgres-ddl.ts`),
    // since generation/validation for an enum field is identical either way.
    type: schema.enum && schema.enum.length > 0 ? "enum" : resolveFieldType(schema),
    required,
  };
  if (schema.enum) field.enum = schema.enum;
  if (schema.pattern) field.pattern = schema.pattern;
  if (schema.format) field.format = schema.format;
  if (schema.minLength !== undefined) field.minLength = schema.minLength;
  if (schema.maxLength !== undefined) field.maxLength = schema.maxLength;
  if (schema.minimum !== undefined) field.minimum = schema.minimum;
  if (schema.maximum !== undefined) field.maximum = schema.maximum;
  if (schema.description) field.description = schema.description;
  if (schema.items) field.items = { type: resolveFieldType(schema.items), enum: schema.items.enum };
  return field;
}

const BSON_TYPE_MAP: Record<string, FieldType> = {
  string: "string",
  int: "integer",
  long: "integer",
  double: "number",
  decimal: "number",
  number: "number",
  bool: "boolean",
  date: "timestamp",
  objectId: "uuid",
  object: "object",
  array: "array",
};

const JSON_TYPE_MAP: Record<string, FieldType> = {
  string: "string",
  integer: "integer",
  number: "number",
  boolean: "boolean",
  object: "object",
  array: "array",
};

/** Resolves either a plain JSON Schema `type` or a Mongo `$jsonSchema` `bsonType` to this package's closed `FieldType` set — `format: "uuid"`/`"date-time"` on a `type: "string"` field narrows further where the JSON Schema convention already distinguishes those (see `mongo-schema.ts`, `openapi.ts`). */
function resolveFieldType(schema: JsonSchemaLike): FieldType {
  if (schema.bsonType) return BSON_TYPE_MAP[schema.bsonType] ?? "string";
  if (schema.type === "string" && schema.format === "uuid") return "uuid";
  if (schema.type === "string" && (schema.format === "date-time" || schema.format === "rfc3339")) {
    return "timestamp";
  }
  if (schema.type) return JSON_TYPE_MAP[schema.type] ?? "string";
  return "string";
}

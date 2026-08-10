/**
 * The normalized shape every ingestor (postgres-ddl/mongo-schema/openapi/json-schema)
 * converts its source format into. Deliberately a closed, purpose-built model — not a
 * re-export of `openapi-types`/`json-schema` — because downstream (constraint registry,
 * prompt building, validation, seeding) all need the same three things regardless of
 * where a schema came from: which fields exist and how they're constrained, which
 * fields are foreign keys, and which business rules don't fit either of those.
 */
export type FieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "timestamp"
  | "uuid"
  | "enum"
  | "object"
  | "array";

/** Recognized cross-field format hints — drives which validator in `validation/` applies (see `validation/validate.ts`). */
export type FieldFormat = "cpf" | "cnpj" | "uuid" | "rfc3339" | "email" | (string & {});

export interface FieldConstraint {
  name: string;
  type: FieldType;
  required: boolean;
  nullable?: boolean;
  /** Set when `type === "enum"`, or when a SQL/JSON Schema enum constrains an otherwise-string field. */
  enum?: string[];
  /** Regex source (no delimiters), e.g. from a Postgres `CHECK (col ~ '...')` or a JSON Schema `pattern`. */
  pattern?: string;
  format?: FieldFormat;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  /** If `type === "array"`, the element type — kept shallow (one level) on purpose, see ingestion/json-schema.ts. */
  items?: { type: FieldType; enum?: string[] };
  /** Free-text description (JSON Schema `description`, OpenAPI `summary`, or a synthesized one) — what gets embedded for this field's `ConstraintRule`. */
  description?: string;
}

export interface ForeignKeyRef {
  field: string;
  referencesEntity: string;
  referencesField: string;
}

export type SchemaSourceKind = "postgres-ddl" | "mongo-schema" | "openapi" | "json-schema";

export interface EntitySchema {
  /** Table/collection/schema name — what `ConstraintRule.entityName` and `SeedTarget` insertion keys off of. */
  name: string;
  primaryKey?: string;
  fields: FieldConstraint[];
  foreignKeys: ForeignKeyRef[];
  /**
   * Rules that don't reduce to a single field's structural constraint — e.g.
   * "a SUSPENDED state registration implies no new PIX keys may be issued".
   * Free text, embedded as `"business-rule"`-kind `ConstraintRule`s (see registry/constraint-registry.ts)
   * and surfaced to the LLM as retrieved context, not mechanically validated.
   */
  businessRules: string[];
  sourceKind: SchemaSourceKind;
}

export function emptyEntitySchema(name: string, sourceKind: SchemaSourceKind): EntitySchema {
  return { name, fields: [], foreignKeys: [], businessRules: [], sourceKind };
}

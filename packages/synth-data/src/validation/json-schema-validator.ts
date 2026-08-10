import type { EntitySchema, FieldConstraint, FieldType } from "../ingestion/types.js";
import { isValidCnpj, isValidCpf } from "./brazilian-documents.js";
import { isEmail, isRfc3339Timestamp, isUuid } from "./format-validators.js";
import type { ValidationIssue } from "./types.js";

/**
 * Structural + format validation against an `EntitySchema` — the "JSON Schema"
 * option from requirement 3's `[Pydantic / Z3 Solver / JSON Schema]` choice,
 * hand-rolled against this package's own `FieldConstraint` shape rather than a
 * generic library: `FieldConstraint` isn't standard JSON Schema (it's the
 * normalized output of three different ingestors, see ingestion/types.ts), and
 * the domain-specific formats (`cpf`/`cnpj`/`rfc3339`/`uuid`) need dedicated
 * validators regardless of which generic engine ran the rest, so there's
 * nothing a library buys here that isn't already needed as bespoke code.
 */
export function validateFields(
  payload: Record<string, unknown>,
  entitySchema: EntitySchema,
): ValidationIssue[] {
  return entitySchema.fields.flatMap((field) => validateField(payload[field.name], field));
}

function validateField(value: unknown, field: FieldConstraint): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isAbsent = value === undefined || value === null;

  if (isAbsent) {
    if (field.required) {
      issues.push({
        field: field.name,
        code: "required",
        message: `"${field.name}" is required but is missing/null.`,
      });
    }
    return issues;
  }

  if (!matchesType(value, field.type)) {
    issues.push({
      field: field.name,
      code: "type",
      message: `"${field.name}" must be of type ${field.type}, got ${describeActualType(value)}.`,
    });
    return issues; // further checks assume the type already matches
  }

  if (field.enum && !field.enum.includes(String(value))) {
    issues.push({
      field: field.name,
      code: "enum",
      message: `"${field.name}" must be one of: ${field.enum.join(", ")} (got "${String(value)}").`,
    });
  }

  if (field.pattern && typeof value === "string" && !new RegExp(field.pattern).test(value)) {
    issues.push({
      field: field.name,
      code: "pattern",
      message: `"${field.name}" must match pattern ${field.pattern} (got "${value}").`,
    });
  }

  if (typeof value === "string") {
    if (field.minLength !== undefined && value.length < field.minLength) {
      issues.push({
        field: field.name,
        code: "min-length",
        message: `"${field.name}" must be at least ${field.minLength} characters (got ${value.length}).`,
      });
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      issues.push({
        field: field.name,
        code: "max-length",
        message: `"${field.name}" must be at most ${field.maxLength} characters (got ${value.length}).`,
      });
    }
  }

  if (typeof value === "number") {
    if (field.minimum !== undefined && value < field.minimum) {
      issues.push({
        field: field.name,
        code: "minimum",
        message: `"${field.name}" must be >= ${field.minimum} (got ${value}).`,
      });
    }
    if (field.maximum !== undefined && value > field.maximum) {
      issues.push({
        field: field.name,
        code: "maximum",
        message: `"${field.name}" must be <= ${field.maximum} (got ${value}).`,
      });
    }
  }

  // A field typed "uuid"/"timestamp" is checked against that format even with
  // no explicit `format` set — the type itself is the promise (an ingestor
  // mapping a Postgres UUID/TIMESTAMPTZ column doesn't also repeat "format:
  // uuid"/"format: rfc3339", see ingestion/postgres-ddl.ts), while an explicit
  // `format` (e.g. `"cpf"` on an otherwise plain `type: "string"` field) always
  // takes precedence.
  const effectiveFormat = field.format ?? IMPLICIT_FORMAT_BY_TYPE[field.type];
  if (effectiveFormat && typeof value === "string" && !matchesFormat(value, effectiveFormat)) {
    issues.push({
      field: field.name,
      code: "format",
      message: `"${field.name}" does not satisfy format "${effectiveFormat}" (got "${value}").`,
    });
  }

  return issues;
}

const IMPLICIT_FORMAT_BY_TYPE: Partial<Record<FieldType, string>> = {
  uuid: "uuid",
  timestamp: "rfc3339",
};

function matchesType(value: unknown, type: FieldType): boolean {
  switch (type) {
    case "string":
    case "enum":
    case "date":
    case "timestamp":
    case "uuid":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    default:
      return true;
  }
}

const FORMAT_VALIDATORS: Record<string, (value: string) => boolean> = {
  cpf: isValidCpf,
  cnpj: isValidCnpj,
  uuid: isUuid,
  rfc3339: isRfc3339Timestamp,
  "date-time": isRfc3339Timestamp,
  email: isEmail,
};

function matchesFormat(value: string, format: string): boolean {
  const validator = FORMAT_VALIDATORS[format];
  return validator ? validator(value) : true; // unknown formats aren't enforceable — not a failure
}

function describeActualType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

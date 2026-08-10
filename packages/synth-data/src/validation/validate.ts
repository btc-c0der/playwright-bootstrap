import type { EntitySchema } from "../ingestion/types.js";
import { validateFields } from "./json-schema-validator.js";
import { entityRecords, validateForeignKeys, type EntityTreePayload, type ValidateForeignKeysOptions } from "./referential-integrity.js";
import type { ValidationIssue, ValidationResult } from "./types.js";

export type ValidatePayloadOptions = ValidateForeignKeysOptions;

/**
 * The single guardrail entry point requirement 3 describes as intercepting
 * "all generated payloads before injection": structural/format checks per
 * record (`json-schema-validator.ts`, including the CPF/CNPJ/RFC-3339/UUID
 * checks it delegates to) plus relational-integrity checks across the whole
 * tree (`referential-integrity.ts`). Called once per attempt by
 * `self-correct.ts`'s retry loop — `generate.ts` never serves a payload this
 * hasn't run against.
 */
export async function validatePayload(
  payload: EntityTreePayload,
  entitySchemas: EntitySchema[],
  options: ValidatePayloadOptions = {},
): Promise<ValidationResult> {
  const fieldIssues: ValidationIssue[] = entitySchemas.flatMap((schema) =>
    entityRecords(payload, schema.name).flatMap((record, index) =>
      validateFields(record, schema).map((issue) => ({
        ...issue,
        field: issue.field ? `${schema.name}[${index}].${issue.field}` : `${schema.name}[${index}]`,
      })),
    ),
  );

  const foreignKeyIssues = await validateForeignKeys(payload, entitySchemas, options);
  const issues = [...fieldIssues, ...foreignKeyIssues];
  return { valid: issues.length === 0, issues };
}

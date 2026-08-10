import type { EntitySchema } from "../ingestion/types.js";
import type { ValidationIssue } from "./types.js";

/**
 * What `generate.ts` actually produces: not one flat object, but a small
 * relational tree keyed by entity name — "a corporate account user payload...
 * with 3 failed PIX attempts" is an `accounts` record, the `users` record it
 * belongs to, and an array of `pix_attempts` records, all in one generation
 * call, which is what "fully populated, relational JSON... payloads" in
 * requirement 2 asks for. Each entity's value is a single record or an array
 * of them (an account has one owning user but many PIX attempts).
 */
export type EntityTreePayload = Record<string, Record<string, unknown> | Record<string, unknown>[]>;

export function entityRecords(payload: EntityTreePayload, entityName: string): Record<string, unknown>[] {
  const value = payload[entityName];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Checks an FK value that isn't satisfiable from the generated tree itself
 * (e.g. `user_id` pointing at a pre-existing staging-DB user the request
 * didn't ask to generate) — an async hook so a real check can hit the staging
 * target `seeding/` is about to insert into. Returning `false`/`undefined`
 * means "couldn't confirm it exists"; omit the option entirely and every FK is
 * validated tree-only, which is exactly right for a payload meant to be
 * self-contained.
 */
export type ResolveExternalForeignKey = (params: {
  entityName: string;
  field: string;
  referencesEntity: string;
  referencesField: string;
  value: unknown;
}) => Promise<boolean>;

export interface ValidateForeignKeysOptions {
  resolveExternal?: ResolveExternalForeignKey;
}

/**
 * For every FK declared on every ingested entity, confirms the value on each
 * generated record of that entity matches an existing primary-key value of
 * the referenced entity — first within the generated tree itself, falling
 * back to `resolveExternal` (staging DB) only if that entity wasn't part of
 * this generation call at all. A missing/null FK value is not flagged here —
 * that's `validateFields`' "required" concern, not a broken chain.
 */
export async function validateForeignKeys(
  payload: EntityTreePayload,
  entitySchemas: EntitySchema[],
  options: ValidateForeignKeysOptions = {},
): Promise<ValidationIssue[]> {
  const schemasByName = new Map(entitySchemas.map((s) => [s.name, s]));
  const issues: ValidationIssue[] = [];

  for (const schema of entitySchemas) {
    for (const record of entityRecords(payload, schema.name)) {
      for (const fk of schema.foreignKeys) {
        const value = record[fk.field];
        if (value === undefined || value === null) continue;

        const targetSchema = schemasByName.get(fk.referencesEntity);
        const targetPk = targetSchema?.primaryKey ?? fk.referencesField;
        const targetRecords = entityRecords(payload, fk.referencesEntity);
        const satisfiedInTree = targetRecords.some((r) => String(r[targetPk]) === String(value));
        if (satisfiedInTree) continue;

        const satisfiedExternally = targetRecords.length === 0 && options.resolveExternal
          ? await options.resolveExternal({
              entityName: schema.name,
              field: fk.field,
              referencesEntity: fk.referencesEntity,
              referencesField: fk.referencesField,
              value,
            })
          : false;
        if (satisfiedExternally) continue;

        issues.push({
          field: `${schema.name}.${fk.field}`,
          code: targetRecords.length === 0 ? "unresolvable-foreign-key" : "foreign-key",
          message: `${schema.name}.${fk.field} = ${JSON.stringify(value)} does not match any ${fk.referencesEntity}.${targetPk} in the generated payload${options.resolveExternal ? " or the staging target" : ""}.`,
        });
      }
    }
  }

  return issues;
}
